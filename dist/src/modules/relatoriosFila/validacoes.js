import { z } from "zod";
import { FormatoTarefaRelatorio, TipoRelatorioAnalitico, } from "../../../generated/prisma/client.js";
const parametrosPeriodoPublicoSchema = z.object({
    dataInicio: z.string().datetime().optional(),
    dataFim: z.string().datetime().optional(),
}).strict().refine((dados) => !dados.dataInicio || !dados.dataFim || new Date(dados.dataInicio) <= new Date(dados.dataFim), { message: "dataInicio deve ser anterior ou igual a dataFim.", path: ["dataInicio"] });
const parametrosEficienciaPublicoSchema = z.object({
    dataInicio: z.string().datetime().optional(),
    dataFim: z.string().datetime().optional(),
    unidadePeriodo: z.enum(["MES", "TRIMESTRE"]).default("MES"),
}).strict().refine((dados) => !dados.dataInicio || !dados.dataFim || new Date(dados.dataInicio) <= new Date(dados.dataFim), { message: "dataInicio deve ser anterior ou igual a dataFim.", path: ["dataInicio"] });
const parametrosPrevisaoVidaUtilPublicoSchema = z.object({
    minimoAmostras: z.coerce.number().int().min(3).max(1000).optional(),
}).strict();
const formatoSchema = z.enum(FormatoTarefaRelatorio).default("JSON");
export const criarTarefaRelatorioSchema = z.discriminatedUnion("tipo", [
    z.object({
        tipo: z.literal(TipoRelatorioAnalitico.EFICIENCIA_OPERACIONAL),
        formato: formatoSchema,
        parametros: parametrosEficienciaPublicoSchema.default({ unidadePeriodo: "MES" }),
        webhookUrl: z.url().optional(),
    }).strict(),
    z.object({
        tipo: z.literal(TipoRelatorioAnalitico.RENTABILIDADE_EQUIPAMENTOS),
        formato: formatoSchema,
        parametros: parametrosPeriodoPublicoSchema.default({}),
        webhookUrl: z.url().optional(),
    }).strict(),
    z.object({
        tipo: z.literal(TipoRelatorioAnalitico.PREVISAO_VIDA_UTIL),
        formato: formatoSchema,
        parametros: parametrosPrevisaoVidaUtilPublicoSchema.default({}),
        webhookUrl: z.url().optional(),
    }).strict(),
]);
export const listarTarefasRelatorioSchema = z.object({
    pagina: z.coerce.number().int().positive().default(1),
    limite: z.coerce.number().int().positive().max(100).default(20),
});
export const idTarefaRelatorioSchema = z.object({
    id: z.string().uuid(),
});
