import { Redis } from "ioredis";
import { RedisStore } from "rate-limit-redis";
import type { Store } from "express-rate-limit";
import { logger } from "../../lib/logger.js";

let conexaoRateLimit: Redis | null = null;

export function criarStoreRateLimit(prefixo: string): Store | undefined {
    if ((process.env.RATE_LIMIT_STORE || "memory").toLowerCase() !== "redis") {
        return undefined;
    }

    try {
        if (!conexaoRateLimit) {
            const urlRedis = process.env.REDIS_URL || "redis://localhost:6379";
            conexaoRateLimit = new Redis(urlRedis, {
                maxRetriesPerRequest: 1,
                enableOfflineQueue: false,
            });
            conexaoRateLimit.on("error", (erro) => {
                logger.warn({ err: erro }, "Falha na conexão Redis do rate limit; aplicando fallback em memória.");
            });
        }

        const cliente = conexaoRateLimit;
        return new RedisStore({
            prefix: `rl:${prefixo}:`,
            sendCommand: async (...args: string[]) => {
                const [comando, ...restante] = args;
                if (!comando) {
                    throw new Error("Comando Redis ausente.");
                }
                return cliente.call(comando, ...restante) as Promise<
                    boolean | number | string | Array<boolean | number | string>
                >;
            },
        });
    } catch (erro) {
        logger.warn(
            { err: erro, prefixo },
            "Não foi possível inicializar store Redis para rate limit; usando memória.",
        );
        return undefined;
    }
}
