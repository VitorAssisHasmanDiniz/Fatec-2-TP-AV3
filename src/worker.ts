import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "./lib/prisma.js";
import {
    NOME_FILA_RELATORIOS,
    processarTarefaRelatorio
} from "./modules/relatoriosFila/processador.js";
import type { DadosTarefaRelatorio } from "./modules/relatoriosFila/fila.js";

const urlRedis = process.env.REDIS_URL || "redis://localhost:6379";
const concorrenciaConfigurada = Number.parseInt(
    process.env.REPORT_CONCORRENCIA || "3",
    10
);
const concorrencia = Number.isFinite(concorrenciaConfigurada)
    && concorrenciaConfigurada > 0
    ? concorrenciaConfigurada
    : 3;

const conexaoRedis = new Redis(urlRedis, {
    maxRetriesPerRequest: null
});

const worker = new Worker<DadosTarefaRelatorio>(
    NOME_FILA_RELATORIOS,
    async (trabalho) => {
        await processarTarefaRelatorio(trabalho.data.tarefaId);
    },
    {
        connection: conexaoRedis,
        concurrency: concorrencia
    }
);

worker.on("completed", (trabalho) => {
    console.info(`Tarefa de relatório ${trabalho.id} processada.`);
});

worker.on("failed", (trabalho, erro) => {
    console.error(
        `Falha na tarefa de relatório ${trabalho?.id ?? "desconhecida"}:`,
        erro.message
    );
});

worker.on("error", (erro) => {
    console.error("Erro no worker de relatórios:", erro);
});

let encerrando = false;

async function encerrarWorker(sinal: string): Promise<void> {
    if (encerrando) {
        return;
    }

    encerrando = true;
    console.info(`${sinal} recebido. Encerrando worker de relatórios...`);

    try {
        await worker.close();
        await conexaoRedis.quit();
        await prisma.$disconnect();
        console.info("Worker de relatórios encerrado com sucesso.");
    } catch (erro) {
        console.error("Erro ao encerrar worker de relatórios:", erro);
        process.exitCode = 1;
    }
}

process.on("SIGINT", () => {
    void encerrarWorker("SIGINT");
});

process.on("SIGTERM", () => {
    void encerrarWorker("SIGTERM");
});

console.info(
    `Worker de relatórios iniciado. Fila: ${NOME_FILA_RELATORIOS}. Concorrência: ${concorrencia}.`
);
