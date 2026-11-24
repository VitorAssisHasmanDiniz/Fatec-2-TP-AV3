import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import AppError from "../../errors/AppError.js";
import ServicoAuditoria from "../../services/ServicoAuditoria.js";
const auditoria = new ServicoAuditoria();
export function gerarPrefixoChaveApi() {
    return randomBytes(4).toString("hex");
}
export function gerarChaveApi() {
    const prefixo = gerarPrefixoChaveApi();
    const segredo = randomBytes(32).toString("hex");
    return { chave: `gc_${prefixo}_${segredo}`, prefixo };
}
export function calcularHashChaveApi(chave) {
    return createHash("sha256").update(chave).digest("hex");
}
export function validarFormatoChaveApi(chave) {
    return /^gc_[a-f0-9]{8}_[a-f0-9]{64}$/.test(chave);
}
export default class ServicoChavesApi {
    async criar(dados, criadoPorId) {
        const [organizacao, usuarioCriador] = await Promise.all([
            prisma.organizacao.findUnique({
                where: { id: dados.organizacaoId },
                select: { id: true },
            }),
            prisma.usuario.findUnique({
                where: { id: criadoPorId },
                select: { id: true },
            }),
        ]);
        if (!organizacao) {
            throw new AppError("Organização não encontrada.", 404, "ORGANIZACAO_NAO_ENCONTRADA");
        }
        if (!usuarioCriador) {
            throw new AppError("Usuário criador não encontrado.", 404, "USUARIO_NAO_ENCONTRADO");
        }
        const { chave, prefixo } = gerarChaveApi();
        const segredoWebhook = randomBytes(32).toString("hex");
        const registro = await prisma.chaveApi.create({
            data: {
                ...dados,
                plano: dados.plano ?? "BASICO",
                limitePorMinuto: dados.limitePorMinuto ?? 60,
                prefixo,
                hashChave: calcularHashChaveApi(chave),
                segredoWebhookHash: segredoWebhook,
                criadoPorId,
            },
        });
        await auditoria.registrar({
            usuarioId: criadoPorId,
            acao: "CRIAR_CHAVE_API",
            entidade: "ChaveApi",
            entidadeId: registro.id,
            detalhes: { nomeParceiro: dados.nomeParceiro, prefixo },
        });
        return { ...this.publico(registro), chave, segredoWebhook };
    }
    async listar() {
        const registros = await prisma.chaveApi.findMany({ orderBy: { criadoEm: "desc" } });
        return registros.map((registro) => this.publico(registro));
    }
    async atualizar(id, dados, usuarioId) {
        const existente = await prisma.chaveApi.findUnique({ where: { id } });
        if (!existente)
            throw new AppError("Chave API não encontrada", 404, "CHAVE_NAO_ENCONTRADA");
        const atualizado = await prisma.chaveApi.update({ where: { id }, data: dados });
        await auditoria.registrar({ usuarioId, acao: "ATUALIZAR_CHAVE_API", entidade: "ChaveApi", entidadeId: id });
        return this.publico(atualizado);
    }
    async revogar(id, usuarioId) {
        const existente = await prisma.chaveApi.findUnique({ where: { id } });
        if (!existente)
            throw new AppError("Chave API não encontrada", 404, "CHAVE_NAO_ENCONTRADA");
        const registro = await prisma.chaveApi.update({ where: { id }, data: { status: "REVOGADA" } });
        await auditoria.registrar({ usuarioId, acao: "REVOGAR_CHAVE_API", entidade: "ChaveApi", entidadeId: id });
        return this.publico(registro);
    }
    async rotacionar(id, usuarioId) {
        const antiga = await prisma.chaveApi.findUnique({ where: { id } });
        if (!antiga)
            throw new AppError("Chave API não encontrada", 404, "CHAVE_NAO_ENCONTRADA");
        if (antiga.status === "REVOGADA")
            throw new AppError("Chave API já revogada", 409, "CHAVE_REVOGADA");
        const gerada = gerarChaveApi();
        const segredoWebhook = randomBytes(32).toString("hex");
        const nova = await prisma.$transaction(async (tx) => {
            await tx.chaveApi.update({ where: { id }, data: { status: "REVOGADA" } });
            return tx.chaveApi.create({
                data: {
                    nomeParceiro: antiga.nomeParceiro,
                    organizacaoId: antiga.organizacaoId,
                    prefixo: gerada.prefixo,
                    hashChave: calcularHashChaveApi(gerada.chave),
                    segredoWebhookHash: segredoWebhook,
                    escopos: antiga.escopos,
                    plano: antiga.plano,
                    limitePorMinuto: antiga.limitePorMinuto,
                    expiraEm: antiga.expiraEm,
                    criadoPorId: usuarioId,
                },
            });
        });
        await auditoria.registrar({
            usuarioId,
            acao: "ROTACIONAR_CHAVE_API",
            entidade: "ChaveApi",
            entidadeId: nova.id,
            detalhes: { chaveAnteriorId: id },
        });
        return { ...this.publico(nova), chave: gerada.chave, segredoWebhook };
    }
    publico(registro) {
        return {
            id: registro.id,
            nomeParceiro: registro.nomeParceiro,
            organizacaoId: registro.organizacaoId,
            prefixo: registro.prefixo,
            escopos: registro.escopos,
            plano: registro.plano,
            limitePorMinuto: registro.limitePorMinuto,
            status: registro.status,
            expiraEm: registro.expiraEm,
            criadoEm: registro.criadoEm,
            ultimoUsoEm: registro.ultimoUsoEm,
        };
    }
}
