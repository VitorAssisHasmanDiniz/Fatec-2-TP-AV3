import AppError from "../../../errors/AppError.js";
import { prisma } from "../../../lib/prisma.js";
import { TipoRelatorioAnalitico } from "../../../../generated/prisma/client.js";
import { analisarEquipamentoVidaUtil, calcularGrupoVidaUtil, } from "../funcoesVidaUtil.js";
const VERSAO_MODELO = "2.0.0";
const MINIMO_PADRAO = 3;
const METODOLOGIA = [
    "Por equipamento, ajusta regressão linear do índice de condição em função dos meses desde a primeira observação individual.",
    "A previsão de cada grupo é a mediana das vidas remanescentes previstas; o R² do grupo é a mediana dos R² individuais.",
    "Equipamentos sem amostras suficientes ou sem duas datas distintas são ignorados.",
].join(" ");
const selecaoObservacao = {
    id: true,
    equipamentoId: true,
    observadoEm: true,
    indiceCondicao: true,
    falhaRegistrada: true,
    equipamento: {
        select: {
            id: true,
            tipo: true,
            marca: true,
            modelo: true,
        },
    },
};
function converterObservacao(observacao) {
    return {
        equipamentoId: observacao.equipamento.id,
        tipoEquipamento: observacao.equipamento.tipo,
        marca: observacao.equipamento.marca,
        modelo: observacao.equipamento.modelo,
        observacao: {
            observadoEm: observacao.observadoEm,
            indiceCondicao: observacao.indiceCondicao,
            falhaRegistrada: observacao.falhaRegistrada,
        },
    };
}
function agruparPorModelo(equipamentos) {
    const grupos = new Map();
    for (const equipamento of equipamentos) {
        const chave = JSON.stringify([
            equipamento.tipoEquipamento,
            equipamento.marca,
            equipamento.modelo,
        ]);
        const grupo = grupos.get(chave) ?? [];
        grupo.push(equipamento);
        grupos.set(chave, grupo);
    }
    return grupos;
}
function criarResultadoIndisponivel(grupo, motivo) {
    const primeiroEquipamento = grupo[0];
    if (!primeiroEquipamento) {
        throw new Error("Não há equipamentos para criar o resultado do grupo.");
    }
    const equipamentosComFalha = grupo.filter((equipamento) => equipamento.observacoes.some((observacao) => observacao.falhaRegistrada)).length;
    return {
        tipoEquipamento: primeiroEquipamento.tipoEquipamento,
        marca: primeiroEquipamento.marca,
        modelo: primeiroEquipamento.modelo,
        amostras: 0,
        metodo: "REGRESSAO_LINEAR",
        rQuadrado: null,
        vidaRemanescenteMeses: null,
        dataPrevistaInservivel: null,
        equipamentosAnalisados: 0,
        taxaFalhas: grupo.length > 0 ? equipamentosComFalha / grupo.length : 0,
        previsaoDisponivel: false,
        motivoIndisponivel: motivo,
    };
}
export async function executarPrevisaoVidaUtil(parametros = {}) {
    const minimoAmostras = parametros.minimoAmostras ?? MINIMO_PADRAO;
    if (!Number.isInteger(minimoAmostras) || minimoAmostras < 1) {
        throw new AppError("O mínimo de amostras deve ser um número inteiro igual ou maior que 1.", 400, "MINIMO_AMOSTRAS_INVALIDO");
    }
    if (parametros.organizacaoId) {
        const organizacao = await prisma.organizacao.findUnique({
            where: { id: parametros.organizacaoId },
            select: { id: true },
        });
        if (!organizacao) {
            throw new AppError("Organização não encontrada.", 404, "ORGANIZACAO_NAO_ENCONTRADA");
        }
    }
    const filtros = {};
    if (parametros.organizacaoId) {
        filtros.equipamento = {
            lote: { organizacaoId: parametros.organizacaoId },
        };
    }
    const observacoes = await prisma.observacaoCondicaoEquipamento.findMany({
        where: filtros,
        select: selecaoObservacao,
        orderBy: { observadoEm: "asc" },
    });
    const equipamentosPorId = new Map();
    for (const observacaoBanco of observacoes) {
        const registro = converterObservacao(observacaoBanco);
        const equipamentoExistente = equipamentosPorId.get(registro.equipamentoId);
        const equipamento = equipamentoExistente ?? {
            equipamentoId: registro.equipamentoId,
            tipoEquipamento: registro.tipoEquipamento,
            marca: registro.marca,
            modelo: registro.modelo,
            observacoes: [],
        };
        equipamento.observacoes.push(registro.observacao);
        equipamentosPorId.set(registro.equipamentoId, equipamento);
    }
    const grupos = agruparPorModelo([...equipamentosPorId.values()]);
    const resultados = [];
    let equipamentosIgnorados = 0;
    const dataReferencia = new Date();
    for (const grupo of grupos.values()) {
        try {
            const analises = grupo.map((equipamento) => analisarEquipamentoVidaUtil(equipamento, minimoAmostras));
            equipamentosIgnorados += analises.filter((analise) => analise.ignorado).length;
            resultados.push(calcularGrupoVidaUtil(grupo, analises, dataReferencia));
        }
        catch (erro) {
            const motivo = erro instanceof Error
                ? `Falha ao calcular o grupo: ${erro.message}`
                : "Falha desconhecida ao calcular o grupo.";
            resultados.push(criarResultadoIndisponivel(grupo, motivo));
        }
    }
    const resumo = {
        gruposAnalisados: resultados.length,
        previsoesDisponiveis: resultados.filter((resultado) => resultado.previsaoDisponivel).length,
        equipamentosIgnorados,
        metodologia: METODOLOGIA,
    };
    const relatorio = await prisma.relatorioAnalitico.create({
        data: {
            tipo: TipoRelatorioAnalitico.PREVISAO_VIDA_UTIL,
            organizacaoId: parametros.organizacaoId,
            versaoModelo: VERSAO_MODELO,
            parametros: {
                organizacaoId: parametros.organizacaoId,
                minimoAmostras,
                metodologia: METODOLOGIA,
            },
            resumo,
            resultadosVidaUtil: {
                create: resultados.map((resultado) => ({
                    tipoEquipamento: resultado.tipoEquipamento,
                    marca: resultado.marca,
                    modelo: resultado.modelo,
                    amostras: resultado.amostras,
                    metodo: resultado.metodo,
                    rQuadrado: resultado.rQuadrado,
                    vidaRemanescenteMeses: resultado.vidaRemanescenteMeses,
                    dataPrevistaInservivel: resultado.dataPrevistaInservivel,
                    equipamentosAnalisados: resultado.equipamentosAnalisados,
                    taxaFalhas: resultado.taxaFalhas,
                    motivoIndisponivel: resultado.motivoIndisponivel,
                    previsaoDisponivel: resultado.previsaoDisponivel,
                })),
            },
        },
    });
    return {
        relatorioId: relatorio.id,
        tipo: "PREVISAO_VIDA_UTIL",
        geradoEm: relatorio.geradoEm,
        versaoModelo: VERSAO_MODELO,
        parametros: {
            ...parametros,
            minimoAmostras,
        },
        resumo,
        resultados,
    };
}
