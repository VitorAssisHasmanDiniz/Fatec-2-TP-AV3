import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { adicionarTarefaNaFila, obterFilaRelatorios } from "./fila.js";
const ESTADOS_TERMINAIS = new Set(["CONCLUIDA", "FALHOU", "EXPIRADA"]);
function obterMinutosReconciliacao() {
    const valor = Number.parseInt(process.env.REPORT_RECONCILIAR_MINUTOS || "10", 10);
    return Number.isFinite(valor) && valor >= 1 ? valor : 10;
}
function obterMinutosTimeoutExecucao() {
    const valor = Number.parseInt(process.env.REPORT_TIMEOUT_EXECUCAO_MIN || "30", 10);
    return Number.isFinite(valor) && valor >= 1 ? valor : 30;
}
function obterMaxTentativas() {
    const valor = Number.parseInt(process.env.REPORT_MAX_TENTATIVAS || "3", 10);
    return Number.isFinite(valor) && valor >= 1 ? valor : 3;
}
export async function reconciliarTarefasRelatorio(agora = new Date()) {
    const fila = obterFilaRelatorios();
    const limiteNaFila = new Date(agora.getTime() - obterMinutosReconciliacao() * 60_000);
    const limiteExecucao = new Date(agora.getTime() - obterMinutosTimeoutExecucao() * 60_000);
    const maxTentativas = obterMaxTentativas();
    let reenfileiradasNaFila = 0;
    let recuperadasExecucao = 0;
    let marcadasFalha = 0;
    // (a) Tarefas NA_FILA há muito tempo sem job ativo/aguardando no BullMQ
    const presasNaFila = await prisma.tarefaRelatorio.findMany({
        where: {
            status: "NA_FILA",
            criadoEm: { lte: limiteNaFila },
        },
        select: { id: true, status: true },
    });
    for (const tarefa of presasNaFila) {
        const jobExistente = await fila.getJob(tarefa.id);
        if (jobExistente) {
            const estado = await jobExistente.getState();
            if (estado === "waiting" || estado === "active" || estado === "delayed" || estado === "prioritized") {
                continue;
            }
            await jobExistente.remove().catch(() => undefined);
        }
        const atual = await prisma.tarefaRelatorio.findUnique({
            where: { id: tarefa.id },
            select: { status: true },
        });
        if (!atual || ESTADOS_TERMINAIS.has(atual.status)) {
            continue;
        }
        await adicionarTarefaNaFila(tarefa.id);
        reenfileiradasNaFila += 1;
        logger.warn({ tarefaId: tarefa.id }, "Tarefa NA_FILA reconciliada e reenfileirada no BullMQ.");
    }
    // (b) Tarefas EM_EXECUCAO além do timeout sem job ativo no BullMQ
    const presasExecucao = await prisma.tarefaRelatorio.findMany({
        where: {
            status: "EM_EXECUCAO",
            OR: [
                { iniciadoEm: { lte: limiteExecucao } },
                { iniciadoEm: null, criadoEm: { lte: limiteExecucao } },
            ],
        },
        select: { id: true, tentativas: true },
    });
    for (const tarefa of presasExecucao) {
        const jobExistente = await fila.getJob(tarefa.id);
        if (jobExistente) {
            const estado = await jobExistente.getState();
            if (estado === "active") {
                continue;
            }
            await jobExistente.remove().catch(() => undefined);
        }
        const atual = await prisma.tarefaRelatorio.findUnique({
            where: { id: tarefa.id },
            select: { status: true, tentativas: true },
        });
        if (!atual || ESTADOS_TERMINAIS.has(atual.status)) {
            continue;
        }
        if (atual.tentativas < maxTentativas) {
            await prisma.tarefaRelatorio.update({
                where: { id: tarefa.id },
                data: {
                    status: "NA_FILA",
                    erro: "Execução interrompida detectada pela reconciliação; tarefa reenfileirada.",
                },
            });
            await adicionarTarefaNaFila(tarefa.id);
            recuperadasExecucao += 1;
            logger.warn({ tarefaId: tarefa.id }, "Tarefa EM_EXECUCAO travada devolvida para NA_FILA.");
        }
        else {
            await prisma.tarefaRelatorio.update({
                where: { id: tarefa.id },
                data: {
                    status: "FALHOU",
                    erro: "Tempo máximo de execução excedido após o limite de tentativas.",
                    concluidoEm: new Date(),
                },
            });
            marcadasFalha += 1;
            logger.error({ tarefaId: tarefa.id }, "Tarefa EM_EXECUCAO marcada como FALHOU na reconciliação.");
        }
    }
    return { reenfileiradasNaFila, recuperadasExecucao, marcadasFalha };
}
