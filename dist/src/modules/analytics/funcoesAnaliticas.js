export function calcularJanelaPeriodoAnterior(dataInicio, dataFim) {
    const duracao = dataFim.getTime() - dataInicio.getTime();
    return {
        inicio: new Date(dataInicio.getTime() - duracao),
        fim: new Date(dataInicio),
    };
}
export function agruparRegistros(registros) {
    const grupos = new Map();
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
        }
        else {
            grupos.set(chave, {
                ...grupo,
                valores: [registro.valorRecuperacao],
            });
        }
    }
    return [...grupos.values()];
}
export function calcularResultados(grupos) {
    return grupos
        .map((grupo) => {
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
