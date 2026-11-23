import { prisma } from "../../lib/prisma.js";

export const NOME_FILA_RELATORIOS = "relatorios";

interface ResultadoAnaliseSimulada {
    simulada: true;
    tipo: string;
    organizacaoId: string;
    parametros: unknown;
    processadoEm: string;
}

function executarAnaliseSimulada(
    tipo: string,
    organizacaoId: string,
    parametros: unknown
): ResultadoAnaliseSimulada {
    return {
        simulada: true,
        tipo,
        organizacaoId,
        parametros,
        processadoEm: new Date().toISOString()
    };
}

export async function processarTarefaRelatorio(tarefaId: string): Promise<void> {
    const tarefa = await prisma.tarefaRelatorio.findUnique({
        where: { id: tarefaId }
    });

    if (!tarefa) {
        throw new Error(`Tarefa de relatório ${tarefaId} não encontrada.`);
    }

    if (tarefa.status === "CONCLUIDA") {
        return;
    }

    if (tarefa.status === "FALHOU") {
        return;
    }

    try {
        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: {
                status: "EM_EXECUCAO",
                progresso: 10,
                iniciadoEm: tarefa.iniciadoEm ?? new Date(),
                tentativas: { increment: 1 },
                erro: null
            }
        });

        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: { progresso: 40 }
        });

        const resultado = executarAnaliseSimulada(
            tarefa.tipo,
            tarefa.organizacaoId,
            tarefa.parametros
        );

        // A persistência do resultado e a geração do arquivo serão adicionadas
        // nas próximas etapas. Aqui validamos o ciclo da fila e do worker.
        if (!resultado.simulada) {
            throw new Error("Não foi possível executar a análise simulada.");
        }

        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: { progresso: 85 }
        });

        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: {
                status: "CONCLUIDA",
                progresso: 100,
                concluidoEm: new Date()
            }
        });
    } catch (erro) {
        const mensagem = erro instanceof Error
            ? erro.message
            : "Falha ao processar o relatório.";

        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: {
                status: "FALHOU",
                erro: mensagem,
                concluidoEm: new Date()
            }
        });

        throw erro;
    }
}
