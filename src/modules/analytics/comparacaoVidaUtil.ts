import { calcularMedianaSegura } from "./calculosEstatisticos.js";

const MS_POR_DIA = 1000 * 60 * 60 * 24;

export interface PrevisaoGrupoPersistida {
    tipoEquipamento: string;
    marca: string;
    modelo: string;
    previsaoDisponivel: boolean;
    dataPrevistaInservivel: Date | null;
}

export interface ObservacaoRealizadaEquipamento {
    equipamentoId: string;
    tipoEquipamento: string;
    marca: string;
    modelo: string;
    observadoEm: Date;
    indiceCondicao: number;
    falhaRegistrada: boolean;
}

export interface ItemComparacaoVidaUtil {
    tipoEquipamento: string;
    marca: string;
    modelo: string;
    previsto: Date | null;
    realizado: Date | null;
    erroDias: number | null;
}

export interface ResultadoComparacaoVidaUtil {
    relatorioId: string;
    geradoEm: Date;
    gruposAvaliados: number;
    gruposComRealizado: number;
    maeDias: number | null;
    itens: ItemComparacaoVidaUtil[];
}

export function compararPrevisaoComRealizado(
    relatorioId: string,
    geradoEm: Date,
    previsoes: PrevisaoGrupoPersistida[],
    observacoesPosteriores: ObservacaoRealizadaEquipamento[],
): ResultadoComparacaoVidaUtil {
    const primeiraOcorrenciaPorEquipamento = new Map<string, ObservacaoRealizadaEquipamento>();

    const ordenadas = [...observacoesPosteriores]
        .filter(
            (obs) => obs.observadoEm.getTime() >= geradoEm.getTime()
                && (obs.indiceCondicao <= 0 || obs.falhaRegistrada),
        )
        .sort((a, b) => a.observadoEm.getTime() - b.observadoEm.getTime());

    for (const obs of ordenadas) {
        if (!primeiraOcorrenciaPorEquipamento.has(obs.equipamentoId)) {
            primeiraOcorrenciaPorEquipamento.set(obs.equipamentoId, obs);
        }
    }

    const datasPorGrupo = new Map<string, number[]>();
    for (const obs of primeiraOcorrenciaPorEquipamento.values()) {
        const chave = JSON.stringify([obs.tipoEquipamento, obs.marca, obs.modelo]);
        const lista = datasPorGrupo.get(chave) ?? [];
        lista.push(obs.observadoEm.getTime());
        datasPorGrupo.set(chave, lista);
    }

    const itens: ItemComparacaoVidaUtil[] = previsoes
        .filter((prev) => prev.previsaoDisponivel && prev.dataPrevistaInservivel !== null)
        .map((prev) => {
            const chave = JSON.stringify([prev.tipoEquipamento, prev.marca, prev.modelo]);
            const timestamps = datasPorGrupo.get(chave) ?? [];
            const medianaTimestamp = calcularMedianaSegura(timestamps);
            const realizado = medianaTimestamp !== null ? new Date(medianaTimestamp) : null;
            const erroDias = realizado && prev.dataPrevistaInservivel
                ? Number((Math.abs(realizado.getTime() - prev.dataPrevistaInservivel.getTime()) / MS_POR_DIA).toFixed(2))
                : null;

            return {
                tipoEquipamento: prev.tipoEquipamento,
                marca: prev.marca,
                modelo: prev.modelo,
                previsto: prev.dataPrevistaInservivel,
                realizado,
                erroDias,
            };
        });

    const errosValidos = itens
        .map((item) => item.erroDias)
        .filter((erro): erro is number => erro !== null);

    const maeDias = errosValidos.length > 0
        ? Number((errosValidos.reduce((acc, v) => acc + v, 0) / errosValidos.length).toFixed(2))
        : null;

    return {
        relatorioId,
        geradoEm,
        gruposAvaliados: itens.length,
        gruposComRealizado: errosValidos.length,
        maeDias,
        itens,
    };
}
