import { ZodError } from "zod";
import AppError from "../../errors/AppError.js";

export type CategoriaErroProcessamento = "PERMANENTE" | "TRANSITORIO";

export interface ResultadoClassificacaoErro {
    categoria: CategoriaErroProcessamento;
    mensagemSegura: string;
}

const MENSAGEM_GENERICA_ERRO = "Erro interno ao processar o relatório. Tente novamente mais tarde.";

const CODIGOS_PRISMA_PERMANENTES = new Set([
    "P2000", "P2002", "P2003", "P2005", "P2006", "P2007",
    "P2011", "P2012", "P2014", "P2019", "P2020", "P2023", "P2025",
]);

const CODIGOS_PRISMA_TRANSITORIOS = new Set([
    "P1001", "P1002", "P1008", "P1017", "P2024", "P2034",
]);

const CODIGOS_SISTEMA_TRANSITORIOS = new Set([
    "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE",
    "EAI_AGAIN", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH",
    "EBUSY", "EMFILE", "ENFILE", "EAGAIN",
]);

function extrairCodigoErro(erro: unknown): string | undefined {
    if (typeof erro !== "object" || erro === null) {
        return undefined;
    }

    const registro = erro as Record<string, unknown>;
    if (typeof registro.code === "string") {
        return registro.code;
    }

    if (typeof registro.cause === "object" && registro.cause !== null) {
        return extrairCodigoErro(registro.cause);
    }

    return undefined;
}

export function sanitizarMensagemErroPublico(erro: unknown): string {
    if (erro instanceof AppError && erro.statusCode >= 400 && erro.statusCode < 500) {
        return erro.message;
    }

    if (erro instanceof ZodError) {
        const detalhe = erro.issues.map((item) => item.message).join("; ");
        return detalhe || "Parâmetros inválidos para geração do relatório.";
    }

    return MENSAGEM_GENERICA_ERRO;
}

export function classificarErroProcessamento(erro: unknown): ResultadoClassificacaoErro {
    if (erro instanceof AppError) {
        if (erro.statusCode >= 400 && erro.statusCode < 500) {
            return {
                categoria: "PERMANENTE",
                mensagemSegura: sanitizarMensagemErroPublico(erro),
            };
        }

        return {
            categoria: "TRANSITORIO",
            mensagemSegura: MENSAGEM_GENERICA_ERRO,
        };
    }

    if (erro instanceof ZodError) {
        return {
            categoria: "PERMANENTE",
            mensagemSegura: sanitizarMensagemErroPublico(erro),
        };
    }

    if (
        erro instanceof TypeError
        || erro instanceof RangeError
        || erro instanceof ReferenceError
        || erro instanceof SyntaxError
    ) {
        return {
            categoria: "PERMANENTE",
            mensagemSegura: MENSAGEM_GENERICA_ERRO,
        };
    }

    const codigo = extrairCodigoErro(erro);
    if (codigo) {
        if (CODIGOS_PRISMA_PERMANENTES.has(codigo)) {
            return {
                categoria: "PERMANENTE",
                mensagemSegura: MENSAGEM_GENERICA_ERRO,
            };
        }

        if (CODIGOS_PRISMA_TRANSITORIOS.has(codigo) || CODIGOS_SISTEMA_TRANSITORIOS.has(codigo)) {
            return {
                categoria: "TRANSITORIO",
                mensagemSegura: MENSAGEM_GENERICA_ERRO,
            };
        }
    }

    return {
        categoria: "TRANSITORIO",
        mensagemSegura: MENSAGEM_GENERICA_ERRO,
    };
}