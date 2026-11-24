import { prisma } from "../../lib/prisma.js";
const selecaoResultadosEficiencia = {
    select: {
        id: true,
        relatorioId: true,
        operadorId: true,
        nomeOperador: true,
        inicioPeriodo: true,
        fimPeriodo: true,
        unidadePeriodo: true,
        quantidadeLotes: true,
        tempoMedioHoras: true,
        tempoMedianoHoras: true,
        desvioPadraoHoras: true,
        gargalo: true,
    },
};
export async function obterHistoricoRelatorios(filtros = {}) {
    return prisma.relatorioAnalitico.findMany({
        where: {
            ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
            ...(filtros.organizacaoId ? { organizacaoId: filtros.organizacaoId } : {}),
            ...(filtros.inicio || filtros.fim ? {
                geradoEm: {
                    ...(filtros.inicio ? { gte: filtros.inicio } : {}),
                    ...(filtros.fim ? { lte: filtros.fim } : {}),
                },
            } : {}),
        },
        orderBy: { geradoEm: "desc" },
        take: filtros.limite ?? 20,
        include: {
            resultadosEficiencia: selecaoResultadosEficiencia,
            resultadosRentabilidade: true,
            resultadosVidaUtil: true,
        },
    });
}
export async function obterRelatorioPorId(id) {
    return prisma.relatorioAnalitico.findUnique({
        where: { id },
        include: {
            resultadosEficiencia: selecaoResultadosEficiencia,
            resultadosRentabilidade: true,
            resultadosVidaUtil: true,
        },
    });
}
