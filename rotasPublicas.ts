import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import AppError from "../../errors/AppError.js";
import ServicoLote from "../../services/ServicoLote.js";
import ServicoAuditoria from "../../services/ServicoAuditoria.js";
import { obterContextoChaveApi, exigirChaveApi } from "./middlewareChaveApi.js";
import { limitadorChaveApi } from "./limitadorChaveApi.js";
import { StatusLote } from "../../../generated/prisma/client.js";

const apiPublicaRouter = Router();
export const relatoriosPublicosRouter = Router();
const servicoLote = new ServicoLote();
const servicoAuditoria = new ServicoAuditoria();

const schemaCriarLote = z.object({
    nf: z.string().trim().min(1).max(100),
    transp: z.string().trim().min(1).max(120),
    dataEntrada: z.string().datetime().optional(),
    observacoes: z.string().optional()
}).strict();

const schemaFiltrosLote = z.object({
    pagina: z.coerce.number().int().positive().default(1),
    limite: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(StatusLote).optional(),
    dataInicio: z.string().datetime().optional(),
    dataFim: z.string().datetime().optional()
});

apiPublicaRouter.get(
    "/rastreabilidade/equipamentos/:codigoBarras",
    exigirChaveApi("tracking:read"),
    limitadorChaveApi,
    async (req, res, next) => {
        try {
            const contexto = obterContextoChaveApi(req);
            const equipamento = await prisma.equipamento.findFirst({
                where: {
                    codigoBarrasInterno: req.params.codigoBarras,
                    lote: { organizacaoId: contexto.organizacaoId }
                },
                select: {
                    codigoBarrasInterno: true,
                    tipo: true,
                    marca: true,
                    modelo: true,
                    anoFabricacao: true,
                    estadoFisico: true,
                    pesoQuilogramas: true,
                    statusRastreamento: true,
                    lote: { select: { id: true, dataEntrada: true, statusProcessamento: true } },
                    historicoMovimentacao: {
                        orderBy: { dataHora: "asc" },
                        select: { dataHora: true, origem: true, destino: true, observacao: true }
                    }
                }
            });

            if (!equipamento) {
                throw new AppError("Equipamento não encontrado.", 404, "EQUIPAMENTO_NAO_ENCONTRADO");
            }

            res.json({ nivel: "SUCESSO", mensagem: "Rastreabilidade consultada com sucesso.", dados: equipamento });
        } catch (erro) {
            next(erro);
        }
    }
);

apiPublicaRouter.get(
    "/lotes",
    exigirChaveApi("batches:read"),
    limitadorChaveApi,
    async (req, res, next) => {
        try {
            const filtros = schemaFiltrosLote.parse(req.query);
            if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim) {
                throw new AppError("A data inicial não pode ser posterior à data final.", 400, "PERIODO_INVALIDO");
            }

            const contexto = obterContextoChaveApi(req);
            const where = {
                organizacaoId: contexto.organizacaoId,
                ...(filtros.status ? { statusProcessamento: filtros.status } : {}),
                ...(filtros.dataInicio || filtros.dataFim ? {
                    dataEntrada: {
                        ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
                        ...(filtros.dataFim ? { lte: new Date(filtros.dataFim) } : {})
                    }
                } : {})
            };

            const [lotes, total] = await Promise.all([
                prisma.lote.findMany({
                    where,
                    select: {
                        id: true,
                        dataEntrada: true,
                        notaFiscal: true,
                        transportadora: true,
                        statusProcessamento: true,
                        observacoes: true,
                        _count: { select: { equipamentos: true } }
                    },
                    orderBy: { dataEntrada: "desc" },
                    skip: (filtros.pagina - 1) * filtros.limite,
                    take: filtros.limite
                }),
                prisma.lote.count({ where })
            ]);

            res.json({
                nivel: "SUCESSO",
                mensagem: "Lotes consultados com sucesso.",
                dados: { lotes, pagina: filtros.pagina, limite: filtros.limite, total, totalPaginas: Math.ceil(total / filtros.limite) }
            });
        } catch (erro) {
            next(erro);
        }
    }
);

apiPublicaRouter.get(
    "/lotes/:id",
    exigirChaveApi("batches:read"),
    limitadorChaveApi,
    async (req, res, next) => {
        try {
            const contexto = obterContextoChaveApi(req);
            const lote = await prisma.lote.findFirst({
                where: { id: req.params.id, organizacaoId: contexto.organizacaoId },
                select: {
                    id: true,
                    dataEntrada: true,
                    notaFiscal: true,
                    transportadora: true,
                    statusProcessamento: true,
                    observacoes: true,
                    equipamentos: {
                        select: {
                            codigoBarrasInterno: true,
                            tipo: true,
                            marca: true,
                            modelo: true,
                            anoFabricacao: true,
                            estadoFisico: true,
                            pesoQuilogramas: true,
                            statusRastreamento: true
                        },
                        orderBy: { posicaoNoLote: "asc" }
                    }
                }
            });

            if (!lote) {
                throw new AppError("Lote não encontrado.", 404, "LOTE_NAO_ENCONTRADO");
            }

            res.json({ nivel: "SUCESSO", mensagem: "Lote consultado com sucesso.", dados: lote });
        } catch (erro) {
            next(erro);
        }
    }
);

apiPublicaRouter.post(
    "/lotes",
    exigirChaveApi("batches:write"),
    limitadorChaveApi,
    async (req, res, next) => {
        try {
            const dados = schemaCriarLote.parse(req.body);
            const contexto = obterContextoChaveApi(req);
            const lote = await servicoLote.criarLote({
                org: contexto.organizacaoId,
                nf: dados.nf,
                transp: dados.transp,
                ...(dados.dataEntrada ? { dataEntrada: new Date(dados.dataEntrada) } : {}),
                ...(dados.observacoes !== undefined ? { observacoes: dados.observacoes } : {})
            }, null);

            await servicoAuditoria.registrar({
                usuarioId: null,
                acao: "CRIAR_LOTE_API_PUBLICA",
                entidade: "Lote",
                entidadeId: lote.id,
                detalhes: { chaveApiId: contexto.chaveId }
            });

            res.status(201).json({ nivel: "SUCESSO", mensagem: "Lote criado com sucesso.", dados: lote });
        } catch (erro) {
            next(erro);
        }
    }
);

apiPublicaRouter.use("/relatorios", relatoriosPublicosRouter);

export { apiPublicaRouter };
