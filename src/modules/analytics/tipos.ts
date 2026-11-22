
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
