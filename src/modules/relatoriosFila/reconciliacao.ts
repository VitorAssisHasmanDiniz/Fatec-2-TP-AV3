import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { adicionarTarefaNaFila, obterFilaRelatorios } from "./fila.js";

const IDADE_MINIMA_ORFA_MS = 2 * 60 * 1000;

export interface ResultadoReconciliacao {
    reenfileiradas: number;
    travadasRecuperadas: number;
}

export async function reconciliarTarefasOrfas(): Promise<ResultadoReconciliacao> {
    const agora = Date.now();
    const limiteOrfa = new Date(agora - IDADE_MINIMA_ORFA_MS);
    const timeoutExecucaoMin = Number.parseInt(process.env.REPORT_TIMEOUT_EXECUCAO_MIN || "30", 10);
    const limiteTravada = new Date(agora - Math.max(5, timeoutExecucaoMin) * 60 * 1000);

    const fila = obterFilaRelatorios();
    let reenfileiradas = 0;
    let travadasRecuperadas = 0;

    const pendentes = await prisma.tarefaRelatorio.findMany({
        where: {
            status: "NA_FILA",
            criadoEm: { lte: limiteOrfa },
        },
        select: { id: true },
        take: 100,
    });

    for (const tarefa of pendentes) {
        const jobExistente = await fila.getJob(tarefa.id);
        const estado = jobExistente ? await jobExistente.getState() : null;

        if (!jobExistente || estado === "failed" || estado === "completed" || estado === "unknown") {
            if (jobExistente) {
                await jobExistente.remove().catch(() => undefined);
            }
            await adicionarTarefaNaFila(tarefa.id);
            reenfileiradas += 1;
        }
    }

    const travadas = await prisma.tarefaRelatorio.findMany({
        where: {
            status: "EM_EXECUCAO",
            iniciadoEm: { lte: limiteTravada },
        },
        select: { id: true },
        take: 100,
    });

    for (const tarefa of travadas) {
        const jobExistente = await fila.getJob(tarefa.id);
        const estado = jobExistente ? await jobExistente.getState() : null;

        if (!jobExistente || estado !== "active") {
            if (jobExistente) {
                await jobExistente.remove().catch(() => undefined);
            }
            await prisma.tarefaRelatorio.updateMany({
                where: { id: tarefa.id, status: "EM_EXECUCAO" },
                data: { status: "NA_FILA", iniciadoEm: null },
            });
            await adicionarTarefaNaFila(tarefa.id);
            travadasRecuperadas += 1;
        }
    }

    if (reenfileiradas > 0 || travadasRecuperadas > 0) {
        logger.info({ reenfileiradas, travadasRecuperadas }, "Reconciliação de tarefas de relatório concluída.");
    }

    return { reenfileiradas, travadasRecuperadas };
}
