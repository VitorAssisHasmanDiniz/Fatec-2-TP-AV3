export { executarAnaliseEficienciaOperacional } from "./services/eficienciaOperacional.js";
export type {
    ParametrosEficiencia,
    ResultadoEficienciaDetalhado,
    ResultadoAnaliseEficiencia,
    ResultadoEficienciaResumo,
    UnidadePeriodo,
} from "./tipos.js";

export { executarAnaliseRentabilidadeEquipamentos } from "./services/rentabilidadeEquipamentos.js";
export type {
    ParametrosRentabilidade,
    ResultadoAnaliseRentabilidade,
    ResultadoRentabilidadeDetalhado,
    ResultadoRentabilidadeResumo,
} from "./tipos.js";

export { executarPrevisaoVidaUtil } from "./services/previsaoVidaUtil.js";
export type {
    ParametrosPrevisaoVidaUtil,
    ResultadoAnaliseVidaUtil,
    ResultadoPrevisaoVidaUtilDetalhado,
} from "./services/previsaoVidaUtil.js";

export { obterHistoricoRelatorios, obterRelatorioPorId } from "./consultas.js";
export type { FiltrosHistoricoRelatorios } from "./consultas.js";
