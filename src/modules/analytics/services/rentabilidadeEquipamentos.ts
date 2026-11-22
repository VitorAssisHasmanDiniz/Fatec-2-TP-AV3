import { prisma } from "../../../../lib/prisma.js";
import { TipoRelatorioAnalitico } from "../../../../generated/prisma/client.js";
import type { ParametrosRentabilidade, ResultadoAnaliseRentabilidade, ResultadoRentabilidadeDetalhado } from "../tipos.js";

const VERSAO_MODELO = "1.0.0";

interface RegistroRecuperacaoComEquipamento {
  valorRecuperacao: { toNumber(): number };
  equipamento: {
    tipo: string;
    estadoFisico: string;
    marca: string;
    modelo: string;
  };
}

interface GrupoRentabilidade {
  tipoEquipamento: string;
  estadoFisico: string;
  marca: string;
  modelo: string;
  valores: number[];
}

function agruparRegistros(registros: RegistroRecuperacaoComEquipamento[]): GrupoRentabilidade[] {
  const grupos = new Map<string, GrupoRentabilidade>();

  for (const registro of registros) {
    const equipamento = registro.equipamento;
    const grupo = {
      tipoEquipamento: equipamento.tipo,
      estadoFisico: equipamento.estadoFisico,
      marca: equipamento.marca,
      modelo: equipamento.modelo,
    };
    const chave = JSON.stringify(grupo);
    const existente = grupos.get(chave);
    const valor = registro.valorRecuperacao.toNumber();

    if (existente) existente.valores.push(valor);
    else grupos.set(chave, { ...grupo, valores: [valor] });
  }

  return [...grupos.values()];
}

function calcularResultados(grupos: GrupoRentabilidade[]): ResultadoRentabilidadeDetalhado[] {
  return grupos.map((grupo) => {
    const valorTotal = grupo.valores.reduce((total, valor) => total + valor, 0);
    return {
      tipoEquipamento: grupo.tipoEquipamento,
      estadoFisico: grupo.estadoFisico,
      marca: grupo.marca,
      modelo: grupo.modelo,
      quantidade: grupo.valores.length,
      valorTotalRecuperacao: Number(valorTotal.toFixed(2)),
      valorMedioRecuperacao: Number((valorTotal / grupo.valores.length).toFixed(2)),
      posicaoRanking: 0,
    };
  }).sort((a, b) => b.valorTotalRecuperacao - a.valorTotalRecuperacao)
    .map((resultado, indice) => ({ ...resultado, posicaoRanking: indice + 1 }));
}

export async function executarAnaliseRentabilidadeEquipamentos(
  parametros: ParametrosRentabilidade = {},
): Promise<ResultadoAnaliseRentabilidade> {
  const filtros: { registradoEm?: { gte?: Date; lte?: Date }; equipamento?: { lote?: { organizacaoId?: string } } } = {};
  if (parametros.dataInicio || parametros.dataFim) {
    filtros.registradoEm = {};
    if (parametros.dataInicio) filtros.registradoEm.gte = parametros.dataInicio;
    if (parametros.dataFim) filtros.registradoEm.lte = parametros.dataFim;
  }
  if (parametros.organizacaoId) filtros.equipamento = { lote: { organizacaoId: parametros.organizacaoId } };

  const registros = await prisma.registroRecuperacao.findMany({
    where: filtros,
    include: { equipamento: { select: { tipo: true, estadoFisico: true, marca: true, modelo: true, lote: { select: { organizacaoId: true } } } } },
  });
  const grupos = agruparRegistros(registros as unknown as RegistroRecuperacaoComEquipamento[]);
  const resultados = calcularResultados(grupos);
  const valorTotal = resultados.reduce((total, resultado) => total + resultado.valorTotalRecuperacao, 0);
  const quantidade = resultados.reduce((total, resultado) => total + resultado.quantidade, 0);
  const geradoEm = new Date();

  const relatorio = await prisma.relatorioAnalitico.create({
    data: {
      tipo: TipoRelatorioAnalitico.RENTABILIDADE_EQUIPAMENTOS,
      organizacaoId: parametros.organizacaoId,
      versaoModelo: VERSAO_MODELO,
      parametros: { organizacaoId: parametros.organizacaoId, dataInicio: parametros.dataInicio?.toISOString(), dataFim: parametros.dataFim?.toISOString() },
      resumo: { quantidadeRegistros: quantidade, valorTotalRecuperacao: Number(valorTotal.toFixed(2)), grupos: resultados.length },
      resultadosRentabilidade: { create: resultados.map((resultado) => ({
        tipoEquipamento: resultado.tipoEquipamento,
        estadoFisico: resultado.estadoFisico,
        marca: resultado.marca,
        modelo: resultado.modelo,
        quantidade: resultado.quantidade,
        valorTotalRecuperacao: resultado.valorTotalRecuperacao,
        valorMedioRecuperacao: resultado.valorMedioRecuperacao,
        posicaoRanking: resultado.posicaoRanking,
      })) },
    },
  });

  return { relatorioId: relatorio.id, tipo: "RENTABILIDADE_EQUIPAMENTOS", geradoEm, versaoModelo: VERSAO_MODELO, parametros, resumo: { quantidadeRegistros: quantidade, valorTotalRecuperacao: Number(valorTotal.toFixed(2)), quantidadeGrupos: resultados.length }, resultados };
}
