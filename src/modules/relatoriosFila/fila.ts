import "dotenv/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { NOME_FILA_RELATORIOS } from "./processador.js";

export interface DadosTarefaRelatorio {
    tarefaId: string;
}

const urlRedis = process.env.REDIS_URL || "redis://localhost:6379";

export const conexaoRedisFila = new IORedis(urlRedis, {
    maxRetriesPerRequest: null
});

export const filaRelatorios = new Queue<DadosTarefaRelatorio>(
    NOME_FILA_RELATORIOS,
    { connection: conexaoRedisFila }
);

export async function adicionarTarefaNaFila(tarefaId: string): Promise<void> {
    await filaRelatorios.add(
        "processar-relatorio",
        { tarefaId },
        {
            jobId: tarefaId,
            removeOnComplete: {
                age: 24 * 60 * 60,
                count: 1000
            },
            removeOnFail: {
                age: 7 * 24 * 60 * 60
            }
        }
    );
}

export async function fecharFilaRelatorios(): Promise<void> {
    await filaRelatorios.close();
    await conexaoRedisFila.quit();
}
