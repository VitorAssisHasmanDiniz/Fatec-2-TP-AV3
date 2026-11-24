import { rateLimit } from "express-rate-limit";
import AppError from "../../errors/AppError.js";
import { obterContextoChaveApi } from "./middlewareChaveApi.js";
import { criarStoreRateLimit } from "./storeRateLimit.js";

export const limitadorChaveApi = rateLimit({
    windowMs: 60 * 1000,
    limit: (req) => obterContextoChaveApi(req).limitePorMinuto,
    keyGenerator: (req) => obterContextoChaveApi(req).chaveId,
    store: criarStoreRateLimit("chave-api"),
    passOnStoreError: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
        next(new AppError("Limite de requisições da chave API excedido", 429, "LIMITE_EXCEDIDO"));
    },
});
