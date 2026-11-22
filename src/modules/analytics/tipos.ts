export interface ParametrosRentabilidade {
    organizacaoId?: string;
    dataInicio?: Date;
    dataFim?: Date;
}

export interface ResultadoRentabilidadeDetalhado {
    tipoEquipamento: string;
    estadoFisico: string;
    marca: string;
    modelo: string;
    quantidade: number;
    valorTotalRecuperacao: number;
    valorMedioRecuperacao: number;
    posicaoRanking: number;
}

export interface ResultadoRentabilidadeResumo {
    quantidadeRegistros: number;
    valorTotalRecuperacao: number;
    quantidadeGrupos: number;
}

export interface ResultadoAnaliseRentabilidade {
    relatorioId: string;
    tipo: "RENTABILIDADE_EQUIPAMENTOS";
    geradoEm: Date;
    versaoModelo: string;
    parametros: ParametrosRentabilidade;
    resumo: ResultadoRentabilidadeResumo;
    resultados: ResultadoRentabilidadeDetalhado[];
}

export type UnidadePeriodo = "MES" | "TRIMESTRE";

export interface ParametrosEficiencia {
    organizacaoId?: string;
    dataInicio?: Date;
    dataFim?: Date;
    unidadePeriodo?: UnidadePeriodo;
}

export interface ResultadoEficienciaDetalhado {
    operadorId: string | null;
    nomeOperador: string;
    inicioPeriodo: Date;
    fimPeriodo: Date;
    unidadePeriodo: UnidadePeriodo;
    quantidadeLotes: number;
    tempoMedioHoras: number;
    tempoMedianoHoras: number;
    desvioPadraoHoras: number;
    gargalo: boolean;
}

export interface ResultadoEficienciaResumo {
    quantidadeLotes: number;
    tempoMedioHoras: number;
    tempoMedianoHoras: number;
    desvioPadraoHoras: number;
    tempoMedioPeriodoAnteriorHoras: number | null;
    variacaoPercentual: number | null;
    quantidadeGargalos: number;
}

export interface ResultadoAnaliseEficiencia {
    relatorioId: string;
    tipo: "EFICIENCIA_OPERACIONAL";
    geradoEm: Date;
    versaoModelo: string;
    parametros: ParametrosEficiencia;
    resumo: ResultadoEficienciaResumo;
    resultados: ResultadoEficienciaDetalhado[];
}

export interface ParametrosPrevisaoVidaUtil {
    organizacaoId?: string;
    minimoAmostras?: number;
}

export interface ObservacaoVidaUtil {
    observadoEm: Date;
    indiceCondicao: number;
    falhaRegistrada: boolean;
}

export interface EquipamentoParaAnaliseVidaUtil {
    equipamentoId: string;
    tipoEquipamento: string;
    marca: string;
    modelo: string;
    observacoes: ObservacaoVidaUtil[];
}

export interface ResultadoEquipamentoVidaUtil {
    equipamentoId: string;
    observacoes: number;
    ignorado: boolean;
    motivoIndisponivel: string | null;
    falhaRegistrada: boolean;
    rQuadrado: number | null;
    vidaRemanescenteMeses: number | null;
}

export interface ResultadoPrevisaoVidaUtilDetalhado {
    tipoEquipamento: string;
    marca: string;
    modelo: string;
    amostras: number;
    metodo: "REGRESSAO_LINEAR" | "DEPRECIACAO_LINEAR";
    rQuadrado: number | null;
    vidaRemanescenteMeses: number | null;
    dataPrevistaInservivel: Date | null;
    equipamentosAnalisados: number;
    taxaFalhas: number;
    previsaoDisponivel: boolean;
    motivoIndisponivel: string | null;
}

export interface ResumoPrevisaoVidaUtil {
    gruposAnalisados: number;
    previsoesDisponiveis: number;
    equipamentosIgnorados: number;
    metodologia: string;
}

export interface ResultadoAnaliseVidaUtil {
    relatorioId: string;
    tipo: "PREVISAO_VIDA_UTIL";
    geradoEm: Date;
    versaoModelo: string;
    parametros: ParametrosPrevisaoVidaUtil & { minimoAmostras: number };
    resumo: ResumoPrevisaoVidaUtil;
    resultados: ResultadoPrevisaoVidaUtilDetalhado[];
}
