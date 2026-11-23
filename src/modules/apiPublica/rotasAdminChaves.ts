import { Router } from "express";
import { z } from "zod";
import AppError from "../../errors/AppError.js";
import autenticar, { type RequisicaoAutenticada } from "../../middlewares/autenticar.js";
import autorizar from "../../middlewares/autorizar.js";
import ServicoChavesApi from "./ServicoChavesApi.js";

const router = Router();
const servico = new ServicoChavesApi();
const escoposValidos = [
    "tracking:read",
    "batches:read",
    "batches:write",
    "reports:read",
    "reports:generate"
] as const;
const planosValidos = ["BASICO", "PROFISSIONAL", "ENTERPRISE"] as const;

const esquemaCriacao = z.object({
    nomeParceiro: z.string().trim().min(1).max(150),
    organizacaoId: z.string().trim().min(1).max(20),
    escopos: z.array(z.enum(escoposValidos)).min(1),
    plano: z.enum(planosValidos).optional(),
    limitePorMinuto: z.number().int().positive().max(100000).optional(),
    expiraEm: z.iso.datetime().nullable().optional()
}).strict();

const esquemaAtualizacao = z.object({
    escopos: z.array(z.enum(escoposValidos)).min(1).optional(),
    plano: z.enum(planosValidos).optional(),
    limitePorMinuto: z.number().int().positive().max(100000).optional(),
    expiraEm: z.iso.datetime().nullable().optional()
}).strict().refine((dados) => Object.keys(dados).length > 0, {
    message: "Informe ao menos um campo para atualização"
});

function obterUsuarioId(req: RequisicaoAutenticada): string {
    if (!req.usuario) {
        throw new AppError("Autenticação necessária", 401, "NAO_AUTENTICADO");
    }
    return req.usuario.id;
}

router.use(autenticar, autorizar("ADMINISTRADOR"));

router.post("/", async (req, res, next) => {
    try {
        const dados = esquemaCriacao.parse(req.body);
        const resultado = await servico.criar({
            ...dados,
            expiraEm: dados.expiraEm
                ? new Date(dados.expiraEm)
                : dados.expiraEm === null
                    ? null
                    : undefined
        }, obterUsuarioId(req as RequisicaoAutenticada));
        res.status(201).json({ nivel: "SUCESSO", mensagem: "Chave API criada", dados: resultado });
    } catch (erro) {
        next(erro);
    }
});

router.get("/", async (_req, res, next) => {
    try {
        const dados = await servico.listar();
        res.json({ nivel: "SUCESSO", mensagem: "Chaves API listadas", dados });
    } catch (erro) {
        next(erro);
    }
});

router.patch("/:id", async (req, res, next) => {
    try {
        const id = z.uuid().parse(req.params.id);
        const dados = esquemaAtualizacao.parse(req.body);
        const resultado = await servico.atualizar(id, {
            ...dados,
            expiraEm: dados.expiraEm
                ? new Date(dados.expiraEm)
                : dados.expiraEm === null
                    ? null
                    : undefined
        }, obterUsuarioId(req as RequisicaoAutenticada));
        res.json({ nivel: "SUCESSO", mensagem: "Chave API atualizada", dados: resultado });
    } catch (erro) {
        next(erro);
    }
});

router.post("/:id/rotacionar", async (req, res, next) => {
    try {
        const id = z.uuid().parse(req.params.id);
        const dados = await servico.rotacionar(id, obterUsuarioId(req as RequisicaoAutenticada));
        res.json({ nivel: "SUCESSO", mensagem: "Chave API rotacionada", dados });
    } catch (erro) {
        next(erro);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const id = z.uuid().parse(req.params.id);
        const dados = await servico.revogar(id, obterUsuarioId(req as RequisicaoAutenticada));
        res.json({ nivel: "SUCESSO", mensagem: "Chave API revogada", dados });
    } catch (erro) {
        next(erro);
    }
});

export default router;
