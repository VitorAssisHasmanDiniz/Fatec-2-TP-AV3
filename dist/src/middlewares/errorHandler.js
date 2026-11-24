import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import AppError from "../errors/AppError.js";
import { logger } from "../lib/logger.js";
const errorHandler = (erro, _req, res, _next) => {
    if (erro instanceof AppError) {
        res.status(erro.statusCode).json({
            nivel: "ERRO",
            mensagem: erro.message,
            codigo: erro.codigo,
        });
        return;
    }
    if (erro instanceof ZodError) {
        const detalhes = erro.issues
            .map((issue) => {
            const caminho = issue.path.join(".");
            return caminho ? `${caminho}: ${issue.message}` : issue.message;
        })
            .join("; ");
        res.status(400).json({
            nivel: "ERRO",
            mensagem: detalhes || "Os dados enviados são inválidos.",
            codigo: "DADOS_INVALIDOS",
        });
        return;
    }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2003") {
        res.status(400).json({
            nivel: "ERRO",
            mensagem: "Referência inválida: o registro relacionado não existe.",
            codigo: "REFERENCIA_INVALIDA",
        });
        return;
    }
    logger.error({ err: erro }, "Erro interno inesperado");
    res.status(500).json({
        nivel: "ERRO",
        mensagem: "Erro interno do servidor",
        codigo: "ERRO_INTERNO",
    });
};
export default errorHandler;
