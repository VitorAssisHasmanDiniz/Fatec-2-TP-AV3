import { mean, median, standardDeviation } from "simple-statistics";
import { prisma } from "../../../../lib/prisma.js";
import { TipoRelatorioAnalitico } from "../../../../generated/prisma/client.js";
import type {
  ParametrosEficiencia,
  ResultadoEficienciaDetalhado,
  ResultadoAnaliseEficiencia,
  ResultadoEficienciaResumo,
  UnidadePeriodo,
} from "../tipos.js";

const VERSAO_MODELO = "1.0.0";
const MILISSEGUNDOS_HORA = 60 * 60 * 1000;
const LIMITE_GARGALO = 1.5;

interface LoteConcluido {
  id: string;
  dataEntrada: Date;
  triagemConcluidaEm: Date;
  triagemResponsavelId: string | null;
  triagemResponsavel: { nome: string } | null;
}

interface GrupoPeriodo {
  chave: string;
  inicio: Date;
  fim: Date;
  operadorId: string | null;
  nomeOperador: string;
  unidade: UnidadePeriodo;
  duracoes: number[];
}

function calcularHoras(inicio: Date, fim: Date): number {
  return (fim.getTime() - inicio.getTime()) / MILISSEGUNDOS_HORA;
}

function limitesPeriodo(data: Date, unidade: UnidadePeriodo): { inicio: Date; fim: Date; chave: string } {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth();
  const mesInicial = unidade === "TRIMESTRE" ? Math.floor(mes / 3) * 3 : mes;
  const inicio = new Date(Date.UTC(ano, mesInicial, 1));
  const fim = new Date(Date.UTC(ano, mesInicial + (unidade === "TRIMESTRE" ? 3 : 1), 1));
  const chave = unidade === "MES"
    ? `${ano}-${String(mesInicial + 1).padStart(2, "0")}`
    : `${ano}-T${Math.floor(mesInicial / 3) + 1}`;
  return { inicio, fim, chave };
}

function agruparLotes(
  lotes: LoteConcluido[],
  unidade: UnidadePeriodo,
): GrupoPeriodo[] {
  const grupos = new Map<string, GrupoPeriodo>();

  for (const lote of lotes) {
    const periodo = limitesPeriodo(lote.triagemConcluidaEm, unidade);
    const operadorId = lote.triagemResponsavelId;
    const nomeOperador = lote.triagemResponsavel?.nome ?? "Operador não identificado";
    const chave = `${periodo.chave}:${operadorId ?? "SEM_OPERADOR"}`;
    const duracao = calcularHoras(lote.dataEntrada, lote.triagemConcluidaEm);

    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.duracoes.push(duracao);
    } else {
      grupos.set(chave, {
        chave,
        inicio: periodo.inicio,
        fim: periodo.fim,
        operadorId,
        nomeOperador,
        unidade,
        duracoes: [duracao],
      });
    }
  }

  return [...grupos.values()];
}

function calcularResumo(duracoes: number[]): Pick<ResultadoEficienciaResumo,
  "quantidadeLotes" | "tempoMedioHoras" | "tempoMedianoHoras" | "desvioPadraoHoras"> {
  if (duracoes.length === 0) {
    return {
      quantidadeLotes: 0,
      tempoMedioHoras: 0,
      tempoMedianoHoras: 0,
      desvioPadraoHoras: 0,
    };
  }

  return {
    quantidadeLotes: duracoes.length,
    tempoMedioHoras: mean(duracoes),
    tempoMedianoHoras: median(duracoes),
    desvioPadraoHoras: duracoes.length > 1 ? standardDeviation(duracoes) : 0,
  };
}

function montarResultados(grupos: GrupoPeriodo[]): ResultadoEficienciaDetalhado[] {
  const mediaGeral = grupos.length > 0
    ? mean(grupos.flatMap((grupo) => grupo.duracoes))
    : 0;

  return grupos.map((grupo) => {
    const resumo = calcularResumo(grupo.duracoes);
    return {
      operadorId: grupo.operadorId,
      nomeOperador: grupo.nomeOperador,
      inicioPeriodo: grupo.inicio,
      fimPeriodo: grupo.fim,
      unidadePeriodo: grupo.unidade,
      ...resumo,
      gargalo: mediaGeral > 0 && resumo.tempoMedioHoras > mediaGeral * LIMITE_GARGALO,
    };
  });
}

function periodoAnterior(dataInicio: Date, unidade: UnidadePeriodo): { inicio: Date; fim: Date } {
  const quantidadeMeses = unidade === "TRIMESTRE" ? 3 : 1;
  const inicio = new Date(Date.UTC(dataInicio.getUTCFullYear(), dataInicio.getUTCMonth() - quantidadeMeses, 1));
  return { inicio, fim: new Date(dataInicio) };
}

export async function executarAnaliseEficienciaOperacional(
  parametros: ParametrosEficiencia = {},
): Promise<ResultadoAnaliseEficiencia> {
  const unidade = parametros.unidadePeriodo ?? "MES";
  const dataFim = parametros.dataFim ?? new Date();
  const dataInicio = parametros.dataInicio ?? new Date(Date.UTC(dataFim.getUTCFullYear(), dataFim.getUTCMonth() - (unidade === "TRIMESTRE" ? 2 : 0), 1));

  const lotes = await prisma.lote.findMany({
    where: {
      statusProcessamento: "TRIAGEM_CONCLUIDA",
      triagemConcluidaEm: { gte: dataInicio, lte: dataFim },
      ...(parametros.organizacaoId ? { organizacaoId: parametros.organizacaoId } : {}),
    },
    select: {
      id: true,
      dataEntrada: true,
      triagemConcluidaEm: true,
      triagemResponsavelId: true,
      triagemResponsavel: { select: { nome: true } },
    },
  });

  const lotesValidos: LoteConcluido[] = lotes.filter(
    (lote): lote is typeof lote & { triagemConcluidaEm: Date } =>
      lote.triagemConcluidaEm !== null && lote.triagemConcluidaEm >= lote.dataEntrada,
  );

  const grupos = agruparLotes(lotesValidos, unidade);
  const resultados = montarResultados(grupos);
  const duracoes = lotesValidos.map((lote) => calcularHoras(lote.dataEntrada, lote.triagemConcluidaEm));
  const resumoBase = calcularResumo(duracoes);

  let mediaAnterior: number | null = null;
  let variacao: number | null = null;
  if (parametros.dataInicio) {
    const anterior = periodoAnterior(dataInicio, unidade);
    const lotesAnteriores = await prisma.lote.findMany({
      where: {
        statusProcessamento: "TRIAGEM_CONCLUIDA",
        triagemConcluidaEm: { gte: anterior.inicio, lt: anterior.fim },
        ...(parametros.organizacaoId ? { organizacaoId: parametros.organizacaoId } : {}),
      },
      select: { dataEntrada: true, triagemConcluidaEm: true },
    });
    const duracoesAnteriores = lotesAnteriores
      .filter((lote): lote is typeof lote & { triagemConcluidaEm: Date } =>
        lote.triagemConcluidaEm !== null && lote.triagemConcluidaEm >= lote.dataEntrada,
      )
      .map((lote) => calcularHoras(lote.dataEntrada, lote.triagemConcluidaEm));

    if (duracoesAnteriores.length > 0) {
      mediaAnterior = mean(duracoesAnteriores);
      if (mediaAnterior !== 0) {
        variacao = ((resumoBase.tempoMedioHoras - mediaAnterior) / mediaAnterior) * 100;
      }
    }
  }

  const resumo: ResultadoEficienciaResumo = {
    ...resumoBase,
    tempoMedioPeriodoAnteriorHoras: mediaAnterior,
    variacaoPercentual: variacao,
    quantidadeGargalos: resultados.filter((resultado) => resultado.gargalo).length,
  };

  const relatorio = await prisma.relatorioAnalitico.create({
    data: {
      tipo: TipoRelatorioAnalitico.EFICIENCIA_OPERACIONAL,
      organizacaoId: parametros.organizacaoId,
      versaoModelo: VERSAO_MODELO,
      parametros: {
        organizacaoId: parametros.organizacaoId ?? null,
        dataInicio: dataInicio.toISOString(),
        dataFim: dataFim.toISOString(),
        unidadePeriodo: unidade,
      },
      resumo: resumo as object,
      resultadosEficiencia: {
        create: resultados.map((resultado) => ({
          operadorId: resultado.operadorId,
          nomeOperador: resultado.nomeOperador,
          inicioPeriodo: resultado.inicioPeriodo,
          fimPeriodo: resultado.fimPeriodo,
          unidadePeriodo: resultado.unidadePeriodo,
          quantidadeLotes: resultado.quantidadeLotes,
          tempoMedioHoras: resultado.tempoMedioHoras,
          tempoMedianoHoras: resultado.tempoMedianoHoras,
          desvioPadraoHoras: resultado.desvioPadraoHoras,
        })),
      },
    },
  });

  return {
    relatorioId: relatorio.id,
    tipo: "EFICIENCIA_OPERACIONAL",
    geradoEm: relatorio.geradoEm,
    versaoModelo: VERSAO_MODELO,
    parametros: { ...parametros, dataInicio, dataFim, unidadePeriodo: unidade },
    resumo,
    resultados,
  };
}
