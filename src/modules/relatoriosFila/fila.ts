import "dotenv/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { NOME_FILA_RELATORIOS } from "./processador.js";

export interface DadosTarefaRelatorio {
    tarefaId: string;
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
        "processar-relatorio",
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

export async function fecharFilaRelatorios(): Promise<void> {
    await filaRelatorios.close();
    await conexaoRedisFila.quit();
}