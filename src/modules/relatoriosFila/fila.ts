import "dotenv/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import cron from "node-cron";
import { logger } from "../../lib/logger.js";
import { obterModoAgendadorAnalytics } from "../analytics/agendamento.js";
import { NOME_FILA_RELATORIOS } from "./processador.js";

export const JOB_PROCESSAR_RELATORIO = "processar-relatorio";
export const JOB_LIMPAR_EXPIRADOS = "limpar-relatorios-expirados";
export const JOB_ANALYTICS_EFICIENCIA = "analytics-eficiencia-operacional";
export const JOB_ANALYTICS_RENTABILIDADE = "analytics-rentabilidade";
export const JOB_ANALYTICS_VIDA_UTIL = "analytics-vida-util";

export interface DadosTarefaRelatorio {
    tarefaId?: string;
}

function obterMaxTentativas(): number {
    const valor = Number.parseInt(process.env.REPORT_MAX_TENTATIVAS || "3", 10);
    return Number.isFinite(valor) && valor >= 1 ? valor : 3;
}

function obterBackoffMs(): number {
    const valor = Number.parseInt(process.env.REPORT_BACKOFF_MS || "5000", 10);
    return Number.isFinite(valor) && valor >= 100 ? valor : 5000;
}

const urlRedis = process.env.REDIS_URL || "redis://localhost:6379";

export const conexaoRedisFila = new Redis(urlRedis, {
    maxRetriesPerRequest: null
});

export const filaRelatorios = new Queue<DadosTarefaRelatorio>(
    NOME_FILA_RELATORIOS,
    {
        connection: conexaoRedisFila,
        defaultJobOptions: {
            attempts: obterMaxTentativas(),
            backoff: {
                type: "exponential",
                delay: obterBackoffMs(),
            },
            removeOnComplete: {
                age: 24 * 60 * 60,
                count: 1000,
            },
            removeOnFail: {
                age: 7 * 24 * 60 * 60,
            },
        },
    }
);

export async function adicionarTarefaNaFila(tarefaId: string): Promise<void> {
    await filaRelatorios.add(
        JOB_PROCESSAR_RELATORIO,
        { tarefaId },
        {
            jobId: tarefaId,
            attempts: obterMaxTentativas(),
            backoff: {
                type: "exponential",
                delay: obterBackoffMs(),
            },
        }
    );
}

export async function registrarAgendamentosWorker(): Promise<void> {
    await filaRelatorios.upsertJobScheduler(
        "scheduler-limpeza-relatorios-expirados",
        { pattern: "0 * * * *" },
        {
            name: JOB_LIMPAR_EXPIRADOS,
            data: {},
            opts: {
                attempts: 2,
                backoff: { type: "exponential", delay: 5000 },
            },
        }
    );

    const agendamentosAnaliticos = [
        {
            schedulerId: "scheduler-analytics-eficiencia",
            jobName: JOB_ANALYTICS_EFICIENCIA,
            expressao: process.env.ANALYTICS_CRON_EFICIENCIA,
        },
        {
            schedulerId: "scheduler-analytics-rentabilidade",
            jobName: JOB_ANALYTICS_RENTABILIDADE,
            expressao: process.env.ANALYTICS_CRON_RENTABILIDADE,
        },
        {
            schedulerId: "scheduler-analytics-vida-util",
            jobName: JOB_ANALYTICS_VIDA_UTIL,
            expressao: process.env.ANALYTICS_CRON_VIDA_UTIL,
        },
    ];

    const modoWorker = obterModoAgendadorAnalytics() === "worker";

    for (const item of agendamentosAnaliticos) {
        const expressao = item.expressao?.trim();
        if (!modoWorker || !expressao) {
            await filaRelatorios.removeJobScheduler(item.schedulerId).catch(() => undefined);
            continue;
        }

        if (!cron.validate(expressao)) {
            logger.error(
                { trabalho: item.jobName, expressao },
                "Expressão cron inválida para scheduler do worker; agendamento ignorado."
            );
            continue;
        }

        await filaRelatorios.upsertJobScheduler(
            item.schedulerId,
            { pattern: expressao },
            {
                name: item.jobName,
                data: {},
                opts: {
                    attempts: 2,
                    backoff: { type: "exponential", delay: 5000 },
                },
            }
        );

        logger.info(
            { trabalho: item.jobName, expressao },
            "Scheduler analítico registrado no BullMQ worker."
        );
    }
}

export async function fecharFilaRelatorios(): Promise<void> {
    await filaRelatorios.close();
    await conexaoRedisFila.quit();
}