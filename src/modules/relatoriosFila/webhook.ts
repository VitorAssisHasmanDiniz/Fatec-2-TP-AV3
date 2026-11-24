import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { UnrecoverableError } from "bullmq";
import AppError from "../../errors/AppError.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { obterFilaRelatorios } from "./fila.js";

export const JOB_ENTREGAR_WEBHOOK = "entregar-webhook-relatorio";

function ehIpv4Bloqueado(endereco: string): boolean {
    const partes = endereco.split(".").map((parte) => Number.parseInt(parte, 10));
    if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return true;
    }

    const [a, b] = partes as [number, number, number, number];

    if (a === 0) return true; // 0.0.0.0/8 (rede atual)
    if (a === 10) return true; // 10.0.0.0/8 (privado)
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / metadata cloud)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (privado)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (privado)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a >= 224) return true; // 224.0.0.0/4 (multicast e reservado)

    return false;
}

function ehIpv6Bloqueado(endereco: string): boolean {
    const normalizado = endereco.toLowerCase();

    if (normalizado === "::" || normalizado === "::1") {
        return true; // indefinido / loopback
    }

    if (normalizado.startsWith("::ffff:")) {
        const ipv4Mapeado = normalizado.slice("::ffff:".length);
        if (isIP(ipv4Mapeado) === 4) {
            return ehIpv4Bloqueado(ipv4Mapeado);
        }
    }

    if (normalizado.startsWith("fc") || normalizado.startsWith("fd")) {
        return true; // fc00::/7 (ULA privado)
    }

    if (
        normalizado.startsWith("fe8")
        || normalizado.startsWith("fe9")
        || normalizado.startsWith("fea")
        || normalizado.startsWith("feb")
    ) {
        return true; // fe80::/10 (link-local)
    }

    if (normalizado.startsWith("ff")) {
        return true; // ff00::/8 (multicast)
    }

    return false;
}

function ehEnderecoIpBloqueado(endereco: string): boolean {
    const tipo = isIP(endereco);
    if (tipo === 4) {
        return ehIpv4Bloqueado(endereco);
    }
    if (tipo === 6) {
        return ehIpv6Bloqueado(endereco);
    }
    return true;
}

export async function validarUrlWebhookSegura(urlTexto: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(urlTexto);
    } catch {
        throw new AppError("A URL de webhook informada é inválida.", 400, "WEBHOOK_URL_INVALIDA");
    }

    if (url.protocol !== "https:") {
        throw new AppError(
            "A URL de webhook deve utilizar exclusivamente o protocolo HTTPS.",
            400,
            "WEBHOOK_PROTOCOLO_INVALIDO",
        );
    }

    if (url.username || url.password) {
        throw new AppError(
            "A URL de webhook não pode conter credenciais embutidas.",
            400,
            "WEBHOOK_URL_INVALIDA",
        );
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (!hostname || hostname.toLowerCase() === "localhost" || hostname.toLowerCase().endsWith(".local")) {
        throw new AppError(
            "O destino do webhook não é permitido.",
            400,
            "WEBHOOK_DESTINO_BLOQUEADO",
        );
    }

    if (isIP(hostname) !== 0) {
        if (ehEnderecoIpBloqueado(hostname)) {
            throw new AppError(
                "Endereços IP privados, loopback ou reservados não são permitidos para webhook.",
                400,
                "WEBHOOK_DESTINO_BLOQUEADO",
            );
        }
        return url;
    }

    let registrosDns: Array<{ address: string; family: number }>;
    try {
        registrosDns = await lookup(hostname, { all: true });
    } catch {
        throw new AppError(
            "Não foi possível resolver o domínio da URL de webhook.",
            400,
            "WEBHOOK_DNS_INVALIDO",
        );
    }

    if (registrosDns.length === 0 || registrosDns.some((item) => ehEnderecoIpBloqueado(item.address))) {
        throw new AppError(
            "O domínio do webhook resolve para um endereço IP não permitido.",
            400,
            "WEBHOOK_DESTINO_BLOQUEADO",
        );
    }

    return url;
}

export async function enfileirarEntregaWebhook(tarefaId: string): Promise<void> {
    const fila = obterFilaRelatorios();
    await fila.add(
        JOB_ENTREGAR_WEBHOOK,
        { tarefaId },
        {
            jobId: `webhook-${tarefaId}`,
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000,
            },
        },
    );
}

export async function entregarWebhookRelatorio(tarefaId: string): Promise<void> {
    const tarefa = await prisma.tarefaRelatorio.findUnique({
        where: { id: tarefaId },
        select: {
            id: true,
            status: true,
            relatorioAnaliticoId: true,
            concluidoEm: true,
            webhookUrl: true,
            chaveApi: {
                select: {
                    segredoWebhookHash: true,
                },
            },
        },
    });

    if (!tarefa || !tarefa.webhookUrl) {
        return;
    }

    try {
        await validarUrlWebhookSegura(tarefa.webhookUrl);
    } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : "URL de webhook bloqueada.";
        throw new UnrecoverableError(mensagem);
    }

    const corpo = JSON.stringify({
        evento: "relatorio.concluido",
        tarefaId: tarefa.id,
        status: tarefa.status,
        relatorioAnaliticoId: tarefa.relatorioAnaliticoId,
        concluidoEm: tarefa.concluidoEm?.toISOString() ?? new Date().toISOString(),
    });

    const segredo = tarefa.chaveApi.segredoWebhookHash ?? "";
    const assinatura = createHmac("sha256", segredo).update(corpo).digest("hex");

    const resposta = await fetch(tarefa.webhookUrl, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Greencode-Webhook/1.0",
            "X-Greencode-Signature": `sha256=${assinatura}`,
        },
        body: corpo,
    });

    if (!resposta.ok) {
        logger.warn(
            { tarefaId: tarefa.id, statusHttp: resposta.status },
            "Endpoint de webhook retornou status HTTP de erro.",
        );
        throw new Error(`Webhook respondeu com HTTP ${resposta.status}.`);
    }

    logger.info({ tarefaId: tarefa.id }, "Webhook de conclusão de relatório entregue com sucesso.");
}