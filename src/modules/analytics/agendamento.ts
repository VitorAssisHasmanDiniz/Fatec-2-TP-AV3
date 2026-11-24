import cron, { type ScheduledTask } from "node-cron";
import { logger } from "../../lib/logger.js";
import {
    executarAnaliseEficienciaOperacional,
    executarAnaliseRentabilidadeEquipamentos,
    executarPrevisaoVidaUtil,
} from "./index.js";

interface TrabalhoAgendado {
    nome: string;
    expressao: string | undefined;
    executar: () => Promise<unknown>;
}

const tarefas: ScheduledTask[] = [];
const execucoesEmAndamento = new Set<string>();
const execucoesAtivas = new Set<Promise<void>>();
let inicializado = false;

async function executarSemConcorrencia(nome: string, executar: () => Promise<unknown>): Promise<void> {
    if (execucoesEmAndamento.has(nome)) {
        logger.warn({ trabalho: nome }, "Execução ignorada: o mesmo trabalho já está em andamento.");
        return;
    }

    execucoesEmAndamento.add(nome);
    try {
        await executar();
        logger.info({ trabalho: nome }, "Trabalho analítico agendado concluído.");
    } catch (erro) {
        logger.error({ err: erro, trabalho: nome }, "Falha na execução do trabalho analítico.");
    } finally {
        execucoesEmAndamento.delete(nome);
    }
}

export function obterModoAgendadorAnalytics(): "servidor" | "worker" {
    const modo = process.env.ANALYTICS_AGENDADOR?.trim().toLowerCase();
    return modo === "worker" ? "worker" : "servidor";
}

export function iniciarAgendamentosAnaliticos(): void {
    if (inicializado) return;

    if (obterModoAgendadorAnalytics() !== "servidor") {
        logger.info("Agendamento analítico no servidor desativado (ANALYTICS_AGENDADOR=worker).");
        return;
    }
    if (inicializado) return;

    const trabalhos: TrabalhoAgendado[] = [
        {
            nome: "eficiencia-operacional",
            expressao: process.env.ANALYTICS_CRON_EFICIENCIA,
            executar: () => executarAnaliseEficienciaOperacional({ unidadePeriodo: "MES" }),
        },
        {
            nome: "rentabilidade",
            expressao: process.env.ANALYTICS_CRON_RENTABILIDADE,
            executar: () => executarAnaliseRentabilidadeEquipamentos(),
        },
        {
            nome: "vida-util",
            expressao: process.env.ANALYTICS_CRON_VIDA_UTIL,
            executar: () => executarPrevisaoVidaUtil(),
        },
    ];

    for (const trabalho of trabalhos) {
        if (!trabalho.expressao?.trim()) continue;
        if (!cron.validate(trabalho.expressao)) {
            logger.error({ trabalho: trabalho.nome, expressao: trabalho.expressao }, "Expressão cron inválida; agendamento ignorado.");
            continue;
        }
        tarefas.push(cron.schedule(trabalho.expressao, () => {
            const execucao = executarSemConcorrencia(trabalho.nome, trabalho.executar);
            execucoesAtivas.add(execucao);
            void execucao.finally(() => execucoesAtivas.delete(execucao));
        }));
        logger.info({ trabalho: trabalho.nome, expressao: trabalho.expressao }, "Agendamento analítico iniciado.");
    }

    inicializado = true;
}

export async function pararAgendamentosAnaliticos(): Promise<void> {
    for (const tarefa of tarefas) tarefa.stop();
    tarefas.length = 0;
    inicializado = false;
    await Promise.all([...execucoesAtivas]);
}
