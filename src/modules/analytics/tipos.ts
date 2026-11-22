export type UnidadePeriodo = "MES" | "TRIMESTRE";

export interface ParametrosEficiencia {
  organizacaoId?: string;
  dataInicio?: Date;
  dataFim?: Date;
  unidadePeriodo?: UnidadePeriodo;
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

export interface ResultadoAnaliseEficiencia {
  relatorioId: string;
  tipo: "EFICIENCIA_OPERACIONAL";
  geradoEm: Date;
  versaoModelo: string;
  parametros: ParametrosEficiencia;
  resumo: ResultadoEficienciaResumo;
  resultados: ResultadoEficienciaDetalhado[];
}
