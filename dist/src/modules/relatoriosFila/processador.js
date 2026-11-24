import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { UnrecoverableError } from "bullmq";
import { prisma } from "../../lib/prisma.js";
import AppError from "../../errors/AppError.js";
import { executarAnaliseEficienciaOperacional, executarAnaliseRentabilidadeEquipamentos, executarPrevisaoVidaUtil, } from "../analytics/index.js";
import { classificarErroProcessamento } from "./classificacaoErros.js";
import { gravarArquivoRelatorio } from "./gravador.js";
export const NOME_FILA_RELATORIOS = "relatorios";
function obterDiasRetencao() {
    const valor = Number.parseInt(process.env.REPORT_RETENCAO_DIAS || "7", 10);
    return Number.isFinite(valor) && valor >= 1 ? valor : 7;
}
function calcularDataExpiracao() {
    const dias = obterDiasRetencao();
    return new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
}
function ehObjeto(valor) {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}
function converterData(valor, nomeCampo) {
    if (valor === undefined || valor === null || valor === "") {
        return undefined;
    }
    if (typeof valor !== "string") {
        throw new AppError(`O parâmetro ${nomeCampo} deve ser uma data em texto.`, 400, "DADOS_INVALIDOS");
    }
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) {
        throw new AppError(`O parâmetro ${nomeCampo} contém uma data inválida.`, 400, "DADOS_INVALIDOS");
    }
    return data;
}
async function validarOrganizacaoExistente(organizacaoId) {
    const organizacao = await prisma.organizacao.findUnique({
        where: { id: organizacaoId },
        select: { id: true },
    });
    if (!organizacao) {
        throw new AppError("Organização vinculada à tarefa não encontrada.", 404, "ORGANIZACAO_NAO_ENCONTRADA");
    }
}
async function executarAnalise(tipo, organizacaoId, parametrosOriginais) {
    const parametros = ehObjeto(parametrosOriginais) ? parametrosOriginais : {};
    const dataInicio = converterData(parametros.dataInicio, "dataInicio");
    const dataFim = converterData(parametros.dataFim, "dataFim");
    switch (tipo) {
        case "EFICIENCIA_OPERACIONAL": {
            const unidadePeriodo = parametros.unidadePeriodo;
            if (unidadePeriodo !== undefined
                && unidadePeriodo !== "MES"
                && unidadePeriodo !== "TRIMESTRE") {
                throw new AppError("O parâmetro unidadePeriodo deve ser MES ou TRIMESTRE.", 400, "DADOS_INVALIDOS");
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
                throw new AppError("O parâmetro minimoAmostras deve ser um número inteiro.", 400, "DADOS_INVALIDOS");
            }
            return executarPrevisaoVidaUtil({
                organizacaoId,
                ...(typeof minimoAmostras === "number" ? { minimoAmostras } : {}),
            });
        }
        default:
            throw new AppError(`Tipo de relatório não suportado: ${tipo}.`, 400, "TIPO_RELATORIO_INVALIDO");
    }
}
async function arquivoJaExiste(caminho) {
    if (!caminho) {
        return false;
    }
    try {
        await access(caminho, fsConstants.R_OK);
        return true;
    }
    catch {
        return false;
    }
}
export async function processarTarefaRelatorio(tarefaId, contextoJob = { tentativaAtual: 1, maxTentativas: 1 }) {
    const tarefa = await prisma.tarefaRelatorio.findUnique({
        where: { id: tarefaId },
    });
    if (!tarefa) {
        throw new UnrecoverableError(`Tarefa de relatório ${tarefaId} não encontrada.`);
    }
    // Idempotência: se já foi concluída e o arquivo existe, não reprocessa
    if (tarefa.status === "CONCLUIDA" && await arquivoJaExiste(tarefa.caminhoArquivo)) {
        return;
    }
    // Se já falhou definitivamente anteriormente, encerra sem duplicar
    if (tarefa.status === "FALHOU") {
        return;
    }
    const numeroTentativa = Math.max(tarefa.tentativas + 1, contextoJob.tentativaAtual);
    try {
        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: {
                status: "EM_EXECUCAO",
                progresso: 10,
                iniciadoEm: tarefa.iniciadoEm ?? new Date(),
                tentativas: numeroTentativa,
                erro: null,
            },
        });
        await validarOrganizacaoExistente(tarefa.organizacaoId);
        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: { progresso: 25 },
        });
        const resultado = await executarAnalise(tarefa.tipo, tarefa.organizacaoId, tarefa.parametros);
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
                erro: null,
                concluidoEm: new Date(),
                expiraEm: calcularDataExpiracao(),
            },
        });
    }
    catch (erro) {
        const classificacao = classificarErroProcessamento(erro);
        const ehPermanente = classificacao.categoria === "PERMANENTE";
        const esgotouTentativas = numeroTentativa >= contextoJob.maxTentativas;
        if (ehPermanente || esgotouTentativas) {
            await prisma.tarefaRelatorio.update({
                where: { id: tarefa.id },
                data: {
                    status: "FALHOU",
                    erro: classificacao.mensagemSegura,
                    concluidoEm: new Date(),
                },
            }).catch(() => undefined);
            if (ehPermanente) {
                throw new UnrecoverableError(classificacao.mensagemSegura);
            }
            throw erro;
        }
        // Falha transitória com tentativas restantes: mantém EM_EXECUCAO/NA_FILA para o BullMQ reexecutar
        await prisma.tarefaRelatorio.update({
            where: { id: tarefa.id },
            data: {
                status: "NA_FILA",
                erro: classificacao.mensagemSegura,
            },
        }).catch(() => undefined);
        throw erro;
    }
}
