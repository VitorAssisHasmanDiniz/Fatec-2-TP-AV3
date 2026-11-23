import { Router } from "express";
import { ZodError } from "zod";
import AppError from "../../errors/AppError.js";
import ServicoAuditoria from "../../services/ServicoAuditoria.js";
import {
    exigirChaveApi,
    obterContextoChaveApi,
} from "../apiPublica/middlewareChaveApi.js";
import { limitadorChaveApi } from "../apiPublica/limitadorChaveApi.js";
import { ServicoTarefasRelatorio } from "./ServicoTarefasRelatorio.js";
import {
    criarTarefaRelatorioSchema,
    idTarefaRelatorioSchema,
    listarTarefasRelatorioSchema,
} from "./validacoes.js";

const relatoriosFilaPublicosRouter = Router();
const servicoTarefas = new ServicoTarefasRelatorio();
const servicoAuditoria = new ServicoAuditoria();

function tratarErroValidacao(erro: unknown): never {
    if (erro instanceof ZodError) {
        const detalhe = erro.issues.map((item) => item.message).join("; ");
        throw new AppError(detalhe || "Parâmetros inválidos.", 400, "DADOS_INVALIDOS");
    }
    throw erro;
}

relatoriosFilaPublicosRouter.post(
    "/",
    exigirChaveApi("reports:generate"),
    limitadorChaveApi,
    async (req, res, next) => {
        try {
            let entrada;
            try {
                entrada = criarTarefaRelatorioSchema.parse(req.body);
            } catch (erro) {
                tratarErroValidacao(erro);
            }

            const contexto = obterContextoChaveApi(req);
            const resultado = await servicoTarefas.criarTarefa(entrada, contexto);

            await servicoAuditoria.registrar({
                usuarioId: null,
                acao: "SOLICITAR_RELATORIO_API_PUBLICA",
                entidade: "TarefaRelatorio",
                entidadeId: resultado.tarefaId,
                detalhes: {
                    chaveApiId: contexto.chaveId,
                    tipo: entrada.tipo,
                    formato: entrada.formato,
                },
            });

            res.status(202).json({
                nivel: "SUCESSO",
                mensagem: "Solicitação de relatório enfileirada com sucesso.",
                dados: resultado,
            });
        } catch (erro) {
            next(erro);
        }
    },
);

relatoriosFilaPublicosRouter.get(
    "/",
    exigirChaveApi("reports:read"),
    limitadorChaveApi,
    async (req, res, next) => {
        try {
            let filtros;
            try {
                filtros = listarTarefasRelatorioSchema.parse(req.query);
            } catch (erro) {
                tratarErroValidacao(erro);
            }

            const contexto = obterContextoChaveApi(req);
            const dados = await servicoTarefas.listarTarefas(filtros, contexto);

            res.json({
                nivel: "SUCESSO",
                mensagem: "Tarefas de relatório consultadas com sucesso.",
                dados,
            });
        } catch (erro) {
            next(erro);
        }
    },
);

relatoriosFilaPublicosRouter.get(
    "/:id",
    exigirChaveApi("reports:read"),
    limitadorChaveApi,
    async (req, res, next) => {
        try {
            let params;
            try {
                params = idTarefaRelatorioSchema.parse(req.params);
            } catch (erro) {
                tratarErroValidacao(erro);
            }

            const contexto = obterContextoChaveApi(req);
            const tarefa = await servicoTarefas.obterTarefaPorId(params.id, contexto);

            res.json({
                nivel: "SUCESSO",
                mensagem: "Status da tarefa de relatório consultado com sucesso.",
                dados: tarefa,
            });
        } catch (erro) {
            next(erro);
        }
    },
);

relatoriosFilaPublicosRouter.get(
    "/:id/download",
    exigirChaveApi("reports:read"),
    limitadorChaveApi,
    async (req, res, next) => {
        try {
            let params;
            try {
                params = idTarefaRelatorioSchema.parse(req.params);
            } catch (erro) {
                tratarErroValidacao(erro);
            }

            const contexto = obterContextoChaveApi(req);
            const { caminhoArquivo, nomeDownload } = await servicoTarefas.prepararDownload(
                params.id,
                contexto,
            );

            res.download(caminhoArquivo, nomeDownload, (erro) => {
                if (erro && !res.headersSent) {
                    next(erro);
                }
            });
        } catch (erro) {
            next(erro);
        }
    },
);

export { relatoriosFilaPublicosRouter };