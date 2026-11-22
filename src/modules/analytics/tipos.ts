/**
 * Tipos públicos compartilhados do módulo analítico.
 * Todos os nomes de domínio e propriedades estão em português.
 */

export type TipoAnalise =
    | "EFICIENCIA_OPERACIONAL"
    | "RENTABILIDADE_EQUIPAMENTOS"
    | "PREVISAO_VIDA_UTIL";

export type UnidadePeriodo = "MES" | "TRIMESTRE";

export interface ParametrosAnalise {
    organizacaoId?: string;
    dataInicio?: Date;
    dataFim?: Date;
}

export interface ResultadoRelatorio {
    relatorioId: string;
    tipo: TipoAnalise;
    geradoEm: Date;
    versaoModelo: string;
    parametros: ParametrosAnalise;
    resumo: Record<string, unknown>;
}

export interface FiltroHistoricoRelatorios {
    tipo?: TipoAnalise;
    organizacaoId?: string;
    dataInicio?: Date;
    dataFim?: Date;
    limite?: number;
}
