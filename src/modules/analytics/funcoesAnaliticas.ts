import type {
    ResultadoRentabilidadeDetalhado,
} from "./tipos.js";

export interface JanelaPeriodo {
    inicio: Date;
    fim: Date;
}

export function calcularJanelaPeriodoAnterior(
    dataInicio: Date,
    dataFim: Date,
): JanelaPeriodo {
    const duracao = dataFim.getTime() - dataInicio.getTime();

    return {
        inicio: new Date(dataInicio.getTime() - duracao),
        fim: new Date(dataInicio),
    };
}

export interface RegistroRecuperacaoParaAnalise {
    valorRecuperacao: number;
    equipamento: {
        tipo: string;
        estadoFisico: string;
        marca: string;
        modelo: string;
    };
}

export interface GrupoRentabilidade {
    tipoEquipamento: string;
    estadoFisico: string;
    marca: string;
    modelo: string;
    valores: number[];
}

export function agruparRegistros(
    registros: RegistroRecuperacaoParaAnalise[],
): GrupoRentabilidade[] {
    const grupos = new Map<string, GrupoRentabilidade>();

    for (const registro of registros) {
        const equipamento = registro.equipamento;
        const grupo = {
            tipoEquipamento: equipamento.tipo,
            estadoFisico: equipamento.estadoFisico,
            marca: equipamento.marca.trim() || "NÃO INFORMADO",
            modelo: equipamento.modelo.trim() || "NÃO INFORMADO",
        };
        const chave = JSON.stringify(grupo);
        const existente = grupos.get(chave);

        if (existente) {
            existente.valores.push(registro.valorRecuperacao);
        } else {
            grupos.set(chave, {
                ...grupo,
                valores: [registro.valorRecuperacao],
            });
        }
    }

    return [...grupos.values()];
}

export function calcularResultados(
    grupos: GrupoRentabilidade[],
): ResultadoRentabilidadeDetalhado[] {
    return grupos
        .map((grupo) => {
            const valorTotal = grupo.valores.reduce(
                (total, valor) => total + valor,
                0,
            );

            return {
                tipoEquipamento: grupo.tipoEquipamento,
                estadoFisico: grupo.estadoFisico,
                marca: grupo.marca,
                modelo: grupo.modelo,
                quantidade: grupo.valores.length,
                valorTotalRecuperacao: Number(valorTotal.toFixed(2)),
                valorMedioRecuperacao: Number(
                    (valorTotal / grupo.valores.length).toFixed(2),
                ),
                posicaoRanking: 0,
            };
        })
        .sort((primeiro, segundo) => {
            const diferencaMedia = segundo.valorMedioRecuperacao
                - primeiro.valorMedioRecuperacao;

            if (diferencaMedia !== 0) {
                return diferencaMedia;
            }

            return segundo.valorTotalRecuperacao
                - primeiro.valorTotalRecuperacao;
        })
        .map((resultado, indice) => ({
            ...resultado,
            posicaoRanking: indice + 1,
        }));
}
