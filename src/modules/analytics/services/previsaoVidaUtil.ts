import { linearRegression, linearRegressionLine, rSquared } from "simple-statistics";
import { prisma } from "../../../../lib/prisma.js";
import { TipoRelatorioAnalitico } from "../../../../generated/prisma/client.js";

export interface ParametrosPrevisaoVidaUtil {
  organizacaoId?: string;
  minimoAmostras?: number;
}

export interface ResultadoPrevisaoVidaUtilDetalhado {
  tipoEquipamento: string;
  marca: string;
  modelo: string;
  amostras: number;
  rQuadrado: number | null;
  vidaRemanescenteMeses: number | null;
  dataPrevistaInservivel: Date | null;
  previsaoDisponivel: boolean;
}

export interface ResultadoAnaliseVidaUtil {
  relatorioId: string;
  tipo: "PREVISAO_VIDA_UTIL";
  geradoEm: Date;
  versaoModelo: string;
  parametros: ParametrosPrevisaoVidaUtil;
  resultados: ResultadoPrevisaoVidaUtilDetalhado[];
}

interface ObservacaoComEquipamento {
  observadoEm: Date;
  indiceCondicao: number;
  equipamento: { tipo: string; marca: string; modelo: string; lote: { organizacaoId: string } };
}

const VERSAO_MODELO = "1.0.0";
const LIMIAR_INSERVIVEL = 0;
const MINIMO_PADRAO = 3;
const MS_POR_MES = 1000 * 60 * 60 * 24 * 30.4375;

function preverGrupo(observacoes: ObservacaoComEquipamento[], minimo: number): ResultadoPrevisaoVidaUtilDetalhado {
  const primeiras = observacoes[0].equipamento;
  const ordenadas = [...observacoes].sort((a, b) => a.observadoEm.getTime() - b.observadoEm.getTime());
  const inicio = ordenadas[0].observadoEm.getTime();
  const pontos: [number, number][] = ordenadas.map((o) => [(o.observadoEm.getTime() - inicio) / MS_POR_MES, o.indiceCondicao]);
  if (pontos.length < minimo || pontos.every((p) => p[1] === pontos[0][1])) {
    return { tipoEquipamento: primeiras.tipo, marca: primeiras.marca, modelo: primeiras.modelo, amostras: pontos.length, rQuadrado: null, vidaRemanescenteMeses: null, dataPrevistaInservivel: null, previsaoDisponivel: false };
  }
  const regressao = linearRegression(pontos);
  const linha = linearRegressionLine(regressao);
  const confianca = rSquared(pontos, linha);
  const xAtual = pontos[pontos.length - 1][0];
  const yAtual = pontos[pontos.length - 1][1];
  const declive = regressao.m;
  if (declive >= 0 || yAtual <= LIMIAR_INSERVIVEL) {
    return { tipoEquipamento: primeiras.tipo, marca: primeiras.marca, modelo: primeiras.modelo, amostras: pontos.length, rQuadrado: Number(confianca.toFixed(4)), vidaRemanescenteMeses: yAtual <= LIMIAR_INSERVIVEL ? 0 : null, dataPrevistaInservivel: yAtual <= LIMIAR_INSERVIVEL ? ordenadas[ordenadas.length - 1].observadoEm : null, previsaoDisponivel: yAtual <= LIMIAR_INSERVIVEL };
  }
  const xAlvo = (LIMIAR_INSERVIVEL - regressao.b) / declive;
  const restante = Math.max(0, xAlvo - xAtual);
  const dataPrevista = new Date(ordenadas[ordenadas.length - 1].observadoEm.getTime() + restante * MS_POR_MES);
  return { tipoEquipamento: primeiras.tipo, marca: primeiras.marca, modelo: primeiras.modelo, amostras: pontos.length, rQuadrado: Number(confianca.toFixed(4)), vidaRemanescenteMeses: Number(restante.toFixed(2)), dataPrevistaInservivel: dataPrevista, previsaoDisponivel: true };
}

export async function executarPrevisaoVidaUtil(parametros: ParametrosPrevisaoVidaUtil = {}): Promise<ResultadoAnaliseVidaUtil> {
  const minimo = parametros.minimoAmostras ?? MINIMO_PADRAO;
  const observacoes = await prisma.observacaoCondicaoEquipamento.findMany({
    where: parametros.organizacaoId ? { equipamento: { lote: { organizacaoId: parametros.organizacaoId } } } : {},
    include: { equipamento: { select: { tipo: true, marca: true, modelo: true, lote: { select: { organizacaoId: true } } } } },
    orderBy: { observadoEm: "asc" },
  }) as unknown as ObservacaoComEquipamento[];
  const grupos = new Map<string, ObservacaoComEquipamento[]>();
  for (const observacao of observacoes) {
    const equipamento = observacao.equipamento;
    const chave = JSON.stringify([equipamento.tipo, equipamento.marca, equipamento.modelo]);
    const grupo = grupos.get(chave) ?? [];
    grupo.push(observacao);
    grupos.set(chave, grupo);
  }
  const resultados = [...grupos.values()].map((grupo) => preverGrupo(grupo, minimo));
  const geradoEm = new Date();
  const relatorio = await prisma.relatorioAnalitico.create({
    data: {
      tipo: TipoRelatorioAnalitico.PREVISAO_VIDA_UTIL,
      organizacaoId: parametros.organizacaoId,
      versaoModelo: VERSAO_MODELO,
      parametros: { ...parametros, minimoAmostras: minimo, limiarInservivel: LIMIAR_INSERVIVEL },
      resumo: { gruposAnalisados: resultados.length, previsoesDisponiveis: resultados.filter((r) => r.previsaoDisponivel).length },
      resultadosVidaUtil: { create: resultados.map((r) => ({ tipoEquipamento: r.tipoEquipamento, marca: r.marca, modelo: r.modelo, amostras: r.amostras, metodo: "REGRESSAO_LINEAR", rQuadrado: r.rQuadrado, vidaRemanescenteMeses: r.vidaRemanescenteMeses, dataPrevistaInservivel: r.dataPrevistaInservivel })) },
    },
  });
  return { relatorioId: relatorio.id, tipo: "PREVISAO_VIDA_UTIL", geradoEm, versaoModelo: VERSAO_MODELO, parametros: { ...parametros, minimoAmostras: minimo }, resultados };
}
