import { ZodError } from "zod";
import AppError from "../../errors/AppError.js";

export type CategoriaErroProcessamento = "PERMANENTE" | "TRANSITORIO";

export interface ResultadoClassificacaoErro {
    categoria: CategoriaErroProcessamento;
    mensagemSegura: string;
}

const CODIGOS_PRISMA_PERMANENTES = new Set([
    "P2000", // Valor muito longo para coluna
    "P2002", // Violação de constraint única
    "P2003", // Violação de foreign key (ex.: organização inexistente)
    "P2005", // Valor inválido armazenado
    "P2006", // Valor inválido fornecido
    "P2007", // Erro de validação de dados
    "P2011", // Violação de NOT NULL
    "P2012", // Valor obrigatório ausente
    "P2014", // Violação de relação obrigatória
    "P2019", // Erro de entrada
    "P2020", // Valor fora do intervalo
    "P2023", // Dados inconsistentes na coluna
    "P2025", // Registro dependente não encontrado
]);

const CODIGOS_PRISMA_TRANSITORIOS = new Set([
    "P1001", // Não foi possível alcançar o servidor de banco
    "P1002", // Tempo limite atingido no banco
    "P1008", // Operação expirou (timeout)
    "P1017", // Servidor encerrou a conexão
    "P2024", // Timeout ao obter conexão do pool
    "P2034", // Conflito de transação / deadlock
]);

const CODIGOS_SISTEMA_TRANSITORIOS = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EPIPE",
    "EAI_AGAIN",
    "ENOTFOUND",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "EBUSY",
    "EMFILE",
    "ENFILE",
    "EAGAIN",
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
    if (erro instanceof AppError) {
        return erro.message;
    }

    if (erro instanceof ZodError) {
        const detalhe = erro.issues.map((item) => item.message).join("; ");
        return detalhe || "Parâmetros inválidos para geração do relatório.";
    }

    if (erro instanceof Error) {
        const primeiraLinha = erro.message.split(/\r?\n/)[0]?.trim();
        if (primeiraLinha && primeiraLinha.length <= 300) {
            return primeiraLinha;
        }
        if (primeiraLinha) {
            return `${primeiraLinha.slice(0, 297)}...`;
        }
    }

    return "Erro interno ao processar o relatório solicitado.";
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
            mensagemSegura: sanitizarMensagemErroPublico(erro),
        };
    }

    if (erro instanceof ZodError) {
        return {
            categoria: "PERMANENTE",
            mensagemSegura: sanitizarMensagemErroPublico(erro),
        };
    }

    const codigo = extrairCodigoErro(erro);
    if (codigo) {
        if (CODIGOS_PRISMA_PERMANENTES.has(codigo)) {
            return {
                categoria: "PERMANENTE",
                mensagemSegura: "Os parâmetros ou referências informados para o relatório são inválidos.",
            };
        }

        if (CODIGOS_PRISMA_TRANSITORIOS.has(codigo) || CODIGOS_SISTEMA_TRANSITORIOS.has(codigo)) {
            return {
                categoria: "TRANSITORIO",
                mensagemSegura: "Falha temporária de comunicação com infraestrutura durante a geração do relatório.",
            };
        }
    }

    if (erro instanceof Error) {
        const mensagemLower = erro.message.toLowerCase();

        if (
            mensagemLower.includes("não suportado")
            || mensagemLower.includes("não encontrada")
            || mensagemLower.includes("não encontrado")
            || mensagemLower.includes("inexistente")
            || mensagemLower.includes("parâmetro")
            || mensagemLower.includes("inválid")
            || mensagemLower.includes("identificador")
        ) {
            return {
                categoria: "PERMANENTE",
                mensagemSegura: sanitizarMensagemErroPublico(erro),
            };
        }

        if (
            mensagemLower.includes("timeout")
            || mensagemLower.includes("timed out")
            || mensagemLower.includes("econn")
            || mensagemLower.includes("connection")
            || mensagemLower.includes("conexão")
            || mensagemLower.includes("redis")
            || mensagemLower.includes("socket")
            || mensagemLower.includes("deadlock")
        ) {
            return {
                categoria: "TRANSITORIO",
                mensagemSegura: "Falha temporária ao processar o relatório. Uma nova tentativa será realizada.",
            };
        }
    }

    return {
        categoria: "TRANSITORIO",
        mensagemSegura: sanitizarMensagemErroPublico(erro),
    };
}