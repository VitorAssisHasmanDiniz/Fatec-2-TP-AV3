import { z } from "zod";

const periodoSchema = z.object({
    organizacaoId: z.string().trim().min(1).max(20).optional(),
    dataInicio: z.coerce.date().optional(),
    dataFim: z.coerce.date().optional(),
}).refine(
    (dados) => !dados.dataInicio || !dados.dataFim || dados.dataInicio <= dados.dataFim,
    { message: "dataInicio deve ser anterior ou igual a dataFim.", path: ["dataInicio"] },
);

export const eficienciaOperacionalSchema = periodoSchema.extend({
    unidadePeriodo: z.enum(["MES", "TRIMESTRE"]).default("MES"),
});

export const rentabilidadeSchema = periodoSchema;

export const previsaoVidaUtilSchema = z.object({
    organizacaoId: z.string().trim().min(1).max(20).optional(),
    minimoAmostras: z.coerce.number().int().min(3).max(1000).optional(),
});

export const historicoSchema = z.object({
    tipo: z.enum([
        "EFICIENCIA_OPERACIONAL",
        "RENTABILIDADE_EQUIPAMENTOS",
        "PREVISAO_VIDA_UTIL",
    ]).optional(),
    organizacaoId: z.string().trim().min(1).max(20).optional(),
    inicio: z.coerce.date().optional(),
    fim: z.coerce.date().optional(),
    limite: z.coerce.number().int().min(1).max(100).default(20),
}).refine(
    (dados) => !dados.inicio || !dados.fim || dados.inicio <= dados.fim,
    { message: "inicio deve ser anterior ou igual a fim.", path: ["inicio"] },
);

export const idRelatorioSchema = z.object({
    id: z.string().uuid(),
});
