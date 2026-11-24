import { calcularMedianaSegura } from "./calculosEstatisticos.js";
const MS_POR_DIA = 1000 * 60 * 60 * 24;
export function compararPrevisaoComRealizado(relatorioId, geradoEm, previsoes, observacoesPosteriores) {
    const primeiraOcorrenciaPorEquipamento = new Map();
    const ordenadas = [...observacoesPosteriores]
        .filter((obs) => obs.observadoEm.getTime() >= geradoEm.getTime()
        && (obs.indiceCondicao <= 0 || obs.falhaRegistrada))
        .sort((a, b) => a.observadoEm.getTime() - b.observadoEm.getTime());
    for (const obs of ordenadas) {
        if (!primeiraOcorrenciaPorEquipamento.has(obs.equipamentoId)) {
            primeiraOcorrenciaPorEquipamento.set(obs.equipamentoId, obs);
        }
    }
    const datasPorGrupo = new Map();
    for (const obs of primeiraOcorrenciaPorEquipamento.values()) {
        const chave = JSON.stringify([obs.tipoEquipamento, obs.marca, obs.modelo]);
        const lista = datasPorGrupo.get(chave) ?? [];
        lista.push(obs.observadoEm.getTime());
        datasPorGrupo.set(chave, lista);
    }
    const itens = previsoes
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
        .filter((erro) => erro !== null);
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
