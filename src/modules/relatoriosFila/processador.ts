import { prisma } from "../../lib/prisma.js";
import {
    executarAnaliseEficienciaOperacional,
    executarAnaliseRentabilidadeEquipamentos,
    executarPrevisaoVidaUtil,
} from "../analytics/index.js";
import { gravarArquivoRelatorio } from "./gravador.js";

export const NOME_FILA_RELATORIOS = "relatorios";

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function converterData(valor: unknown, nomeCampo: string): Date | undefined {
    if (valor === undefined || valor === null || valor === "") {
        return undefined;
    }

    if (typeof valor !== "string") {
        throw new Error(`O parâmetro ${nomeCampo} deve ser uma data em texto.`);
    }

    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) {
        throw new Error(`O parâmetro ${nomeCampo} contém uma data inválida.`);
    }

    return data;
}

async function executarAnalise(
    tipo: string,
    organizacaoId: string,
    parametrosOriginais: unknown,
): Promise<unknown> {
    const parametros = ehObjeto(parametrosOriginais) ? parametrosOriginais : {};
    const dataInicio = converterData(parametros.dataInicio, "dataInicio");
    const dataFim = converterData(parametros.dataFim, "dataFim");

    switch (tipo) {
        case "EFICIENCIA_OPERACIONAL": {
            const unidadePeriodo = parametros.unidadePeriodo;
            if (unidadePeriodo !== undefined
                && unidadePeriodo !== "MES"
                && unidadePeriodo !== "TRIMESTRE") {
                throw new Error("O parâmetro unidadePeriodo deve ser MES ou TRIMESTRE.");
            }

            return executarAnaliseEficienciaOperacional({
                organizacaoId,
                ...(dataInicio ? { dataInicio } : {}),
                ...(dataFim ? { dataFim } : {}),
                ...(unidadePeriodo ? { unidadePeriodo } : {}),
            });
        }
        case "RENTABILIDADE_EQUIPAMENTOS":
            return executarAnaliseRentabilidadeEquipamentos({
                organizacaoId,
                ...(dataInicio ? { dataInicio } : {}),
                ...(dataFim ? { dataFim } : {}),
            });
        case "PREVISAO_VIDA_UTIL": {
            const minimoAmostras = parametros.minimoAmostras;
            if (minimoAmostras !== undefined
                && (typeof minimoAmostras !== "number" || !Number.isInteger(minimoAmostras))) {
                throw new Error("O parâmetro minimoAmostras deve ser um número inteiro.");
            }

            return executarPrevisaoVidaUtil({
                organizacaoId,
                ...(typeof minimoAmostras === "number" ? { minimoAmostras } : {}),
            });
        }
        default:
            throw new Error(`Tipo de relatório não suportado: ${tipo}.`);
    }
}

export async function processarTarefaRelatorio(tarefaId: string): Promise<void> {
    const tarefa = await prisma.tarefaRelatorio.findUnique({
        where: { id: tarefaId },
    });

    if (!tarefa) {
        throw new Error(`Tarefa de relatório ${tarefaId} não encontrada.`);
    }

    if (tarefa.status === "CONCLUIDA" || tarefa.status === "FALHOU") {
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
                erro: null,
            },
        });

        const resultado = await executarAnalise(
            tarefa.tipo,
            tarefa.organizacaoId,
            tarefa.parametros,
        );

        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: { progresso: 75 },
        });

        if (!ehObjeto(resultado) || typeof resultado.relatorioId !== "string") {
            throw new Error("A análise não retornou um identificador de relatório válido.");
        }

        const arquivo = await gravarArquivoRelatorio({
            tarefaId: tarefa.id,
            formato: tarefa.formato,
            resultado,
        });

        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: {
                status: "CONCLUIDA",
                progresso: 100,
                relatorioAnaliticoId: resultado.relatorioId,
                caminhoArquivo: arquivo.caminho,
                tamanhoBytes: arquivo.tamanhoBytes,
                concluidoEm: new Date(),
            },
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
                concluidoEm: new Date(),
            },
        });

        throw erro;
    }
}
