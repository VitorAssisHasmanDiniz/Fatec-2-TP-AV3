import "dotenv/config";
import { UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "./lib/prisma.js";
import {
    executarAnaliseEficienciaOperacional,
    executarAnaliseRentabilidadeEquipamentos,
    executarPrevisaoVidaUtil,
} from "./modules/analytics/index.js";
import {
    NOME_FILA_RELATORIOS,
    processarTarefaRelatorio
} from "./modules/relatoriosFila/processador.js";
import {
    JOB_ANALYTICS_EFICIENCIA,
    JOB_ANALYTICS_RENTABILIDADE,
    JOB_ANALYTICS_VIDA_UTIL,
    JOB_LIMPAR_EXPIRADOS,
    fecharFilaRelatorios,
    registrarAgendamentosWorker,
    type DadosTarefaRelatorio,
} from "./modules/relatoriosFila/fila.js";
import { limparRelatoriosExpirados } from "./modules/relatoriosFila/limpezaExpirados.js";
import { logger } from "./lib/logger.js";
import { sanitizarMensagemErroPublico } from "./modules/relatoriosFila/classificacaoErros.js";

const urlRedis = process.env.REDIS_URL || "redis://localhost:6379";
const concorrenciaConfigurada = Number.parseInt(
    process.env.REPORT_CONCORRENCIA || "3",
    10
);
const concorrencia = Number.isFinite(concorrenciaConfigurada)
    && concorrenciaConfigurada > 0
    ? concorrenciaConfigurada
    : 3;

const maxTentativasPadrao = Number.parseInt(
    process.env.REPORT_MAX_TENTATIVAS || "3",
    10
);

const conexaoRedis = new Redis(urlRedis, {
    maxRetriesPerRequest: null
});

const worker = new Worker<DadosTarefaRelatorio>(
    NOME_FILA_RELATORIOS,
    async (trabalho) => {
        switch (trabalho.name) {
            case JOB_LIMPAR_EXPIRADOS: {
                await limparRelatoriosExpirados();
                return;
            }
            case JOB_ANALYTICS_EFICIENCIA: {
                await executarAnaliseEficienciaOperacional({ unidadePeriodo: "MES" });
                return;
            }
            case JOB_ANALYTICS_RENTABILIDADE: {
                await executarAnaliseRentabilidadeEquipamentos();
                return;
            }
            case JOB_ANALYTICS_VIDA_UTIL: {
                await executarPrevisaoVidaUtil();
                return;
            }
            default: {
                const tarefaId = trabalho.data?.tarefaId;
                if (!tarefaId) {
                    return;
                }

                const maxTentativas = typeof trabalho.opts.attempts === "number" && trabalho.opts.attempts > 0
                    ? trabalho.opts.attempts
                    : (Number.isFinite(maxTentativasPadrao) && maxTentativasPadrao > 0 ? maxTentativasPadrao : 3);

                await processarTarefaRelatorio(tarefaId, {
                    tentativaAtual: trabalho.attemptsMade + 1,
                    maxTentativas,
                });
            }
        }
    },
    {
        connection: conexaoRedis,
        concurrency: concorrencia
    }
);

worker.on("completed", (trabalho) => {
    console.info(`Job ${trabalho.name} (${trabalho.id}) processado.`);
});

worker.on("failed", async (trabalho, erro) => {
    logger.error(
        { err: erro, jobName: trabalho?.name, jobId: trabalho?.id },
        "Falha definitiva ou tentativa falhada no worker.",
    );

    const tarefaId = trabalho?.data?.tarefaId;
    if (!trabalho || !tarefaId) {
        return;
    }

    const maxTentativas = typeof trabalho.opts.attempts === "number" && trabalho.opts.attempts > 0
        ? trabalho.opts.attempts
        : (Number.isFinite(maxTentativasPadrao) && maxTentativasPadrao > 0 ? maxTentativasPadrao : 3);
    const ehUnrecoverable = erro instanceof UnrecoverableError || erro.name === "UnrecoverableError";
    const esgotou = ehUnrecoverable || trabalho.attemptsMade >= maxTentativas;

    if (!esgotou) {
        return;
    }

    await prisma.tarefaRelatorio.updateMany({
        where: {
            id: tarefaId,
            status: { in: ["NA_FILA", "EM_EXECUCAO"] },
        },
        data: {
            status: "FALHOU",
            erro: sanitizarMensagemErroPublico(erro),
            concluidoEm: new Date(),
        },
    }).catch((erroAtualizacao: any) => {
        logger.error({ err: erroAtualizacao, tarefaId }, "Falha ao atualizar status FALHOU no handler failed.");
    });
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
        await fecharFilaRelatorios();
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

await registrarAgendamentosWorker();

console.info(
    `Worker de relatórios iniciado. Fila: ${NOME_FILA_RELATORIOS}. Concorrência: ${concorrencia}.`
);