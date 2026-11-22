import AppError from "../../../errors/AppError.js";
import { prisma } from "../../../lib/prisma.js";
import { Prisma, TipoRelatorioAnalitico } from "../../../../generated/prisma/client.js";
import type {
    ParametrosRentabilidade,
    ResultadoAnaliseRentabilidade,
} from "../tipos.js";
import {
    agruparRegistros,
    calcularResultados,
    type RegistroRecuperacaoParaAnalise,
} from "../funcoesAnaliticas.js";

const VERSAO_MODELO = "1.0.0";

const selecaoRecuperacao = {
    valorRecuperacao: true,
    equipamento: {
        select: {
            tipo: true,
            estadoFisico: true,
            marca: true,
            modelo: true,
        },
    },
} as const;

type RegistroRecuperacaoBanco = Prisma.RegistroRecuperacaoGetPayload<{
    select: typeof selecaoRecuperacao;
}>;

function converterRegistro(
    registro: RegistroRecuperacaoBanco,
): RegistroRecuperacaoParaAnalise {
    return {
        valorRecuperacao: registro.valorRecuperacao.toNumber(),
        equipamento: {
            tipo: registro.equipamento.tipo,
            estadoFisico: registro.equipamento.estadoFisico,
            marca: registro.equipamento.marca,
            modelo: registro.equipamento.modelo,
        },
    };
}

export async function executarAnaliseRentabilidadeEquipamentos(
    parametros: ParametrosRentabilidade = {},
): Promise<ResultadoAnaliseRentabilidade> {
    if (parametros.organizacaoId) {
        const organizacao = await prisma.organizacao.findUnique({
            where: { id: parametros.organizacaoId },
            select: { id: true },
        });

        if (!organizacao) {
            throw new AppError(
                "Organização não encontrada.",
                404,
                "ORGANIZACAO_NAO_ENCONTRADA",
            );
        }
    }

    const filtros: Prisma.RegistroRecuperacaoWhereInput = {};

    if (parametros.dataInicio || parametros.dataFim) {
        filtros.registradoEm = {
            ...(parametros.dataInicio ? { gte: parametros.dataInicio } : {}),
            ...(parametros.dataFim ? { lte: parametros.dataFim } : {}),
        };
    }

    if (parametros.organizacaoId) {
        filtros.equipamento = {
            lote: { organizacaoId: parametros.organizacaoId },
        };
    }

    const registros = await prisma.registroRecuperacao.findMany({
        where: filtros,
        select: selecaoRecuperacao,
    });
    const registrosParaAnalise = registros.map(converterRegistro);
    const grupos = agruparRegistros(registrosParaAnalise);
    const resultados = calcularResultados(grupos);
    const valorTotal = resultados.reduce(
        (total, resultado) => total + resultado.valorTotalRecuperacao,
        0,
    );
    const quantidade = resultados.reduce(
        (total, resultado) => total + resultado.quantidade,
        0,
    );
    const resumo = {
        quantidadeRegistros: quantidade,
        valorTotalRecuperacao: Number(valorTotal.toFixed(2)),
        quantidadeGrupos: resultados.length,
    };

    const relatorio = await prisma.relatorioAnalitico.create({
        data: {
            tipo: TipoRelatorioAnalitico.RENTABILIDADE_EQUIPAMENTOS,
            organizacaoId: parametros.organizacaoId,
            versaoModelo: VERSAO_MODELO,
            parametros: {
                organizacaoId: parametros.organizacaoId,
                dataInicio: parametros.dataInicio?.toISOString(),
                dataFim: parametros.dataFim?.toISOString(),
            },
            resumo,
            resultadosRentabilidade: {
                create: resultados.map((resultado) => ({
                    tipoEquipamento: resultado.tipoEquipamento,
                    estadoFisico: resultado.estadoFisico,
                    marca: resultado.marca,
                    modelo: resultado.modelo,
                    quantidade: resultado.quantidade,
                    valorTotalRecuperacao: resultado.valorTotalRecuperacao,
                    valorMedioRecuperacao: resultado.valorMedioRecuperacao,
                    posicaoRanking: resultado.posicaoRanking,
                })),
            },
        },
    });

    return {
        relatorioId: relatorio.id,
        tipo: "RENTABILIDADE_EQUIPAMENTOS",
        geradoEm: relatorio.geradoEm,
        versaoModelo: VERSAO_MODELO,
        parametros,
        resumo,
        resultados,
    };
}
