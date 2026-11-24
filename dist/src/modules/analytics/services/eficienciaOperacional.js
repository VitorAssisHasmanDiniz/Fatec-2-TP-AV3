import { mean } from "simple-statistics";
import AppError from "../../../errors/AppError.js";
import { prisma } from "../../../lib/prisma.js";
import { TipoRelatorioAnalitico } from "../../../../generated/prisma/client.js";
import { calcularResumoEstatistico } from "../calculosEstatisticos.js";
import { calcularJanelaPeriodoAnterior } from "../funcoesAnaliticas.js";
const VERSAO_MODELO = "1.0.0";
const MILISSEGUNDOS_HORA = 60 * 60 * 1000;
const LIMITE_GARGALO = 1.5;
function calcularHoras(inicio, fim) {
    return (fim.getTime() - inicio.getTime()) / MILISSEGUNDOS_HORA;
}
function limitesPeriodo(data, unidade) {
    const ano = data.getUTCFullYear();
    const mes = data.getUTCMonth();
    const mesInicial = unidade === "TRIMESTRE"
        ? Math.floor(mes / 3) * 3
        : mes;
    const inicio = new Date(Date.UTC(ano, mesInicial, 1));
    const fim = new Date(Date.UTC(ano, mesInicial + (unidade === "TRIMESTRE" ? 3 : 1), 1));
    const chave = unidade === "MES"
        ? `${ano}-${String(mesInicial + 1).padStart(2, "0")}`
        : `${ano}-T${Math.floor(mesInicial / 3) + 1}`;
    return { inicio, fim, chave };
}
function agruparLotes(lotes, unidade) {
    const grupos = new Map();
    for (const lote of lotes) {
        const periodo = limitesPeriodo(lote.triagemConcluidaEm, unidade);
        const operadorId = lote.triagemResponsavelId;
        const nomeOperador = lote.triagemResponsavel?.nome ?? "Operador não identificado";
        const chave = `${periodo.chave}:${operadorId ?? "SEM_OPERADOR"}`;
        const duracao = calcularHoras(lote.dataEntrada, lote.triagemConcluidaEm);
        const grupo = grupos.get(chave);
        if (grupo) {
            grupo.duracoes.push(duracao);
        }
        else {
            grupos.set(chave, {
                chave,
                inicio: periodo.inicio,
                fim: periodo.fim,
                operadorId,
                nomeOperador,
                unidade,
                duracoes: [duracao],
            });
        }
    }
    return [...grupos.values()];
}
function calcularResumo(duracoes) {
    const resumo = calcularResumoEstatistico(duracoes);
    return {
        quantidadeLotes: resumo.quantidade,
        tempoMedioHoras: resumo.media,
        tempoMedianoHoras: resumo.mediana,
        desvioPadraoHoras: resumo.desvioPadrao,
    };
}
function montarResultados(grupos) {
    const mediaGeral = grupos.length > 0
        ? mean(grupos.flatMap((grupo) => grupo.duracoes))
        : 0;
    return grupos.map((grupo) => {
        const resumo = calcularResumo(grupo.duracoes);
        return {
            operadorId: grupo.operadorId,
            nomeOperador: grupo.nomeOperador,
            inicioPeriodo: grupo.inicio,
            fimPeriodo: grupo.fim,
            unidadePeriodo: grupo.unidade,
            ...resumo,
            gargalo: mediaGeral > 0
                && resumo.tempoMedioHoras > mediaGeral * LIMITE_GARGALO,
        };
    });
}
export async function executarAnaliseEficienciaOperacional(parametros = {}) {
    const unidade = parametros.unidadePeriodo ?? "MES";
    const dataFim = parametros.dataFim ?? new Date();
    const dataInicio = parametros.dataInicio ?? new Date(Date.UTC(dataFim.getUTCFullYear(), dataFim.getUTCMonth() - (unidade === "TRIMESTRE" ? 2 : 0), 1));
    if (parametros.organizacaoId) {
        const organizacao = await prisma.organizacao.findUnique({
            where: { id: parametros.organizacaoId },
            select: { id: true },
        });
        if (!organizacao) {
            throw new AppError("Organização não encontrada.", 404, "ORGANIZACAO_NAO_ENCONTRADA");
        }
    }
    const filtroLotes = {
        statusProcessamento: { not: "CANCELADO" },
        triagemConcluidaEm: {
            gte: dataInicio,
            lte: dataFim,
        },
        ...(parametros.organizacaoId
            ? { organizacaoId: parametros.organizacaoId }
            : {}),
    };
    const lotes = await prisma.lote.findMany({
        where: filtroLotes,
        select: {
            id: true,
            dataEntrada: true,
            triagemConcluidaEm: true,
            triagemResponsavelId: true,
            triagemResponsavel: { select: { nome: true } },
        },
    });
    const lotesValidos = lotes.filter((lote) => lote.triagemConcluidaEm !== null
        && lote.triagemConcluidaEm >= lote.dataEntrada);
    const grupos = agruparLotes(lotesValidos, unidade);
    const resultados = montarResultados(grupos);
    const duracoes = lotesValidos.map((lote) => calcularHoras(lote.dataEntrada, lote.triagemConcluidaEm));
    const resumoBase = calcularResumo(duracoes);
    // O período anterior usa exatamente a duração do intervalo analisado.
    const anterior = calcularJanelaPeriodoAnterior(dataInicio, dataFim);
    const lotesAnteriores = await prisma.lote.findMany({
        where: {
            statusProcessamento: { not: "CANCELADO" },
            triagemConcluidaEm: {
                gte: anterior.inicio,
                lt: anterior.fim,
            },
            ...(parametros.organizacaoId
                ? { organizacaoId: parametros.organizacaoId }
                : {}),
        },
        select: {
            dataEntrada: true,
            triagemConcluidaEm: true,
        },
    });
    const duracoesAnteriores = lotesAnteriores
        .filter((lote) => lote.triagemConcluidaEm !== null
        && lote.triagemConcluidaEm >= lote.dataEntrada)
        .map((lote) => calcularHoras(lote.dataEntrada, lote.triagemConcluidaEm));
    let mediaAnterior = null;
    let variacao = null;
    if (duracoesAnteriores.length > 0) {
        mediaAnterior = mean(duracoesAnteriores);
        if (mediaAnterior !== 0) {
            variacao = ((resumoBase.tempoMedioHoras - mediaAnterior) / mediaAnterior) * 100;
        }
    }
    const resumo = {
        ...resumoBase,
        tempoMedioPeriodoAnteriorHoras: mediaAnterior,
        variacaoPercentual: variacao,
        quantidadeGargalos: resultados.filter((resultado) => resultado.gargalo).length,
    };
    const relatorio = await prisma.relatorioAnalitico.create({
        data: {
            tipo: TipoRelatorioAnalitico.EFICIENCIA_OPERACIONAL,
            organizacaoId: parametros.organizacaoId,
            versaoModelo: VERSAO_MODELO,
            parametros: {
                organizacaoId: parametros.organizacaoId ?? null,
                dataInicio: dataInicio.toISOString(),
                dataFim: dataFim.toISOString(),
                unidadePeriodo: unidade,
            },
            resumo: resumo,
            resultadosEficiencia: {
                create: resultados.map((resultado) => ({
                    operadorId: resultado.operadorId,
                    nomeOperador: resultado.nomeOperador,
                    inicioPeriodo: resultado.inicioPeriodo,
                    fimPeriodo: resultado.fimPeriodo,
                    unidadePeriodo: resultado.unidadePeriodo,
                    quantidadeLotes: resultado.quantidadeLotes,
                    tempoMedioHoras: resultado.tempoMedioHoras,
                    tempoMedianoHoras: resultado.tempoMedianoHoras,
                    desvioPadraoHoras: resultado.desvioPadraoHoras,
                    gargalo: resultado.gargalo,
                })),
            },
        },
    });
    return {
        relatorioId: relatorio.id,
        tipo: "EFICIENCIA_OPERACIONAL",
        geradoEm: relatorio.geradoEm,
        versaoModelo: VERSAO_MODELO,
        parametros: { ...parametros, dataInicio, dataFim, unidadePeriodo: unidade },
        resumo,
        resultados,
    };
}
