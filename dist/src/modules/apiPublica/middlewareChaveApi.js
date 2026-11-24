import { createHash, timingSafeEqual } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../../lib/prisma.js";
import AppError from "../../errors/AppError.js";
import { validarFormatoChaveApi } from "./ServicoChavesApi.js";
import { criarStoreRateLimit } from "./storeRateLimit.js";
const limitadorTentativasInvalidas = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    store: criarStoreRateLimit("tentativas-invalidas"),
    passOnStoreError: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
        next(new AppError("Muitas tentativas com chave API inválida", 429, "TENTATIVAS_INVALIDAS_EXCEDIDAS"));
    },
});
function hashParaComparacao(valor) {
    return createHash("sha256").update(valor).digest();
}
function compararHashes(chave, hashArmazenado) {
    const hashInformado = hashParaComparacao(chave);
    const hashBanco = Buffer.from(hashArmazenado, "hex");
    if (hashInformado.length !== hashBanco.length) {
        return false;
    }
    return timingSafeEqual(hashInformado, hashBanco);
}
function rejeitarChaveInvalida(req, res, next, codigo, mensagem) {
    limitadorTentativasInvalidas(req, res, (erro) => {
        if (erro) {
            next(erro);
            return;
        }
        next(new AppError(mensagem, 401, codigo));
    });
}
export function exigirChaveApi(escopo) {
    return async (req, res, next) => {
        const chave = req.header("X-API-Key");
        if (!chave) {
            next(new AppError("Chave API não informada", 401, "CHAVE_AUSENTE"));
            return;
        }
        if (!validarFormatoChaveApi(chave)) {
            rejeitarChaveInvalida(req, res, next, "CHAVE_INVALIDA", "Chave API inválida");
            return;
        }
        try {
            const hash = createHash("sha256").update(chave).digest("hex");
            const registro = await prisma.chaveApi.findUnique({ where: { hashChave: hash } });
            if (!registro || !compararHashes(chave, registro.hashChave)) {
                rejeitarChaveInvalida(req, res, next, "CHAVE_INVALIDA", "Chave API inválida");
                return;
            }
            if (registro.status === "REVOGADA") {
                next(new AppError("Chave API revogada", 401, "CHAVE_REVOGADA"));
                return;
            }
            if (registro.expiraEm && registro.expiraEm <= new Date()) {
                next(new AppError("Chave API expirada", 401, "CHAVE_EXPIRADA"));
                return;
            }
            if (!registro.escopos.includes(escopo)) {
                next(new AppError("Escopo insuficiente para esta operação", 403, "ESCOPO_INSUFICIENTE"));
                return;
            }
            req.contextoChaveApi = {
                chaveId: registro.id,
                organizacaoId: registro.organizacaoId,
                escopos: registro.escopos,
                limitePorMinuto: registro.limitePorMinuto,
            };
            if (!registro.ultimoUsoEm || Date.now() - registro.ultimoUsoEm.getTime() >= 60_000) {
                void prisma.chaveApi.update({
                    where: { id: registro.id },
                    data: { ultimoUsoEm: new Date() },
                }).catch(() => undefined);
            }
            next();
        }
        catch (erro) {
            next(erro);
        }
    };
}
export function obterContextoChaveApi(req) {
    const requisicao = req;
    if (!requisicao.contextoChaveApi) {
        throw new AppError("Contexto da chave API indisponível", 401, "CHAVE_AUSENTE");
    }
    return requisicao.contextoChaveApi;
}
