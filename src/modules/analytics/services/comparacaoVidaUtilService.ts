import { prisma } from "../../../lib/prisma.js";
import AppError from "../../../errors/AppError.js";
import { TipoRelatorioAnalitico } from "../../../../generated/prisma/client.js";
import {
    compararPrevisaoComRealizado,
    type ResultadoComparacaoVidaUtil,
} from "../comparacaoVidaUtil.js";

export async function obterComparacaoVidaUtil(
    relatorioId: string,
): Promise<ResultadoComparacaoVidaUtil> {
    const relatorio = await prisma.relatorioAnalitico.findUnique({
        where: { id: relatorioId },
        select: {
            id: true,
            tipo: true,
            organizacaoId: true,
            geradoEm: true,
            resultadosVidaUtil: {
                select: {
                    tipoEquipamento: true,
                    marca: true,
                    modelo: true,
                    previsaoDisponivel: true,
                    dataPrevistaInservivel: true,
                },
            },
        },
    });

    if (!relatorio) {
        throw new AppError(
            "Relatório analítico não encontrado.",
            404,
            "RELATORIO_NAO_ENCONTRADO",
        );
    }

    if (relatorio.tipo !== TipoRelatorioAnalitico.PREVISAO_VIDA_UTIL) {
        throw new AppError(
            "O relatório informado não é do tipo PREVISAO_VIDA_UTIL.",
            400,
            "TIPO_RELATORIO_INVALIDO",
        );
    }

    const observacoesBanco = await prisma.observacaoCondicaoEquipamento.findMany({
        where: {
            observadoEm: { gte: relatorio.geradoEm },
            OR: [
                { indiceCondicao: { lte: 0 } },
                { falhaRegistrada: true },
            ],
            ...(relatorio.organizacaoId
                ? { equipamento: { lote: { organizacaoId: relatorio.organizacaoId } } }
                : {}),
        },
        select: {
            equipamentoId: true,
            observadoEm: true,
            indiceCondicao: true,
            falhaRegistrada: true,
            equipamento: {
                select: {
                    tipo: true,
                    marca: true,
                    modelo: true,
                },
            },
        },
        orderBy: { observadoEm: "asc" },
    });

    const observacoesPosteriores = observacoesBanco.map((item) => ({
        equipamentoId: item.equipamentoId,
        tipoEquipamento: item.equipamento.tipo,
        marca: item.equipamento.marca,
        modelo: item.equipamento.modelo,
        observadoEm: item.observadoEm,
        indiceCondicao: item.indiceCondicao,
        falhaRegistrada: item.falhaRegistrada,
    }));

    return compararPrevisaoComRealizado(
        relatorio.id,
        relatorio.geradoEm,
        relatorio.resultadosVidaUtil,
        observacoesPosteriores,
    );
}