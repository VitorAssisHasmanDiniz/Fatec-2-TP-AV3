import cron from "node-cron";
import { TipoRelatorioAnalitico } from "../../../generated/prisma/client.js";

export type ModoAgendamentoAnalytics = "local" | "worker";

export interface DefinicaoAgendamentoAnalytics {
    tipo: TipoRelatorioAnalitico;
    variavelAmbiente: string;
    expressaoCron: string;
}

export interface ConfiguracaoAgendamentoAnalytics {
    modo: ModoAgendamentoAnalytics;
    agendamentos: DefinicaoAgendamentoAnalytics[];
}

export function validarExpressaoCron(expressao: string): boolean {
    const valor = expressao.trim();
    if (!valor) return false;
    return cron.validate(valor);
}

export function obterConfiguracaoAgendamentoAnalytics(
    env: Record<string, string | undefined> = process.env,
): ConfiguracaoAgendamentoAnalytics {
    const modoBruto = (env.ANALYTICS_AGENDADOR || "local").trim().toLowerCase();
    const modo: ModoAgendamentoAnalytics = modoBruto === "worker" ? "worker" : "local";

    const candidatos: Array<{
        tipo: TipoRelatorioAnalitico;
        variavelAmbiente: string;
        valor: string | undefined;
    }> = [
        {
            tipo: TipoRelatorioAnalitico.EFICIENCIA_OPERACIONAL,
            variavelAmbiente: "ANALYTICS_CRON_EFICIENCIA",
            valor: env.ANALYTICS_CRON_EFICIENCIA,
        },
        {
            tipo: TipoRelatorioAnalitico.RENTABILIDADE_EQUIPAMENTOS,
            variavelAmbiente: "ANALYTICS_CRON_RENTABILIDADE",
            valor: env.ANALYTICS_CRON_RENTABILIDADE,
        },
        {
            tipo: TipoRelatorioAnalitico.PREVISAO_VIDA_UTIL,
            variavelAmbiente: "ANALYTICS_CRON_VIDA_UTIL",
            valor: env.ANALYTICS_CRON_VIDA_UTIL,
        },
    ];

    const agendamentos: DefinicaoAgendamentoAnalytics[] = [];
    for (const item of candidatos) {
        const expressao = item.valor?.trim();
        if (!expressao) continue;
        if (!validarExpressaoCron(expressao)) {
            throw new Error(
                `Expressão cron inválida em ${item.variavelAmbiente}: "${expressao}".`,
            );
        }
        agendamentos.push({
            tipo: item.tipo,
            variavelAmbiente: item.variavelAmbiente,
            expressaoCron: expressao,
        });
    }

    return { modo, agendamentos };
}
