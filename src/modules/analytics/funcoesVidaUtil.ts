import {
    calcularMedianaSegura,
    calcularRegressaoLinear,
} from "./calculosEstatisticos.js";
import type {
    EquipamentoParaAnaliseVidaUtil,
    ResultadoEquipamentoVidaUtil,
    ResultadoPrevisaoVidaUtilDetalhado,
} from "./tipos.js";

const MILISSEGUNDOS_POR_MES = 1000 * 60 * 60 * 24 * 30.4375;

/**
 * Ajusta uma regressão independente para cada equipamento.
 * O eixo X representa os meses desde a primeira observação do próprio equipamento.
 */
export function analisarEquipamentoVidaUtil(
    equipamento: EquipamentoParaAnaliseVidaUtil,
    minimoAmostras: number,
): ResultadoEquipamentoVidaUtil {
    const observacoes = [...equipamento.observacoes].sort(
        (primeira, segunda) => primeira.observadoEm.getTime() - segunda.observadoEm.getTime(),
    );
    const datasDistintas = new Set(
        observacoes.map((observacao) => observacao.observadoEm.getTime()),
    );
    const falhaRegistrada = observacoes.some(
        (observacao) => observacao.falhaRegistrada,
    );

    if (observacoes.length < minimoAmostras) {
        return {
            equipamentoId: equipamento.equipamentoId,
            observacoes: observacoes.length,
            ignorado: true,
            motivoIndisponivel: "Amostras insuficientes para regressão linear.",
            falhaRegistrada,
            rQuadrado: null,
            vidaRemanescenteMeses: null,
        };
    }

    if (datasDistintas.size < 2) {
        return {
            equipamentoId: equipamento.equipamentoId,
            observacoes: observacoes.length,
            ignorado: true,
            motivoIndisponivel: "As observações precisam conter pelo menos duas datas distintas.",
            falhaRegistrada,
            rQuadrado: null,
            vidaRemanescenteMeses: null,
        };
    }

    const primeiraData = observacoes[0].observadoEm.getTime();
    const pontos: [number, number][] = observacoes.map((observacao) => [
        (observacao.observadoEm.getTime() - primeiraData) / MILISSEGUNDOS_POR_MES,
        observacao.indiceCondicao,
    ]);
    const regressao = calcularRegressaoLinear(pontos);
    const ultimaObservacao = observacoes[observacoes.length - 1];
    const ultimoIndice = ultimaObservacao.indiceCondicao;
    const rQuadradoCalculado = regressao.coeficienteDeterminacao;
    const rQuadrado = Number.isFinite(rQuadradoCalculado)
        ? Number(rQuadradoCalculado.toFixed(4))
        : null;

    if (ultimaObservacao.falhaRegistrada || ultimoIndice <= 0) {
        return {
            equipamentoId: equipamento.equipamentoId,
            observacoes: observacoes.length,
            ignorado: false,
            motivoIndisponivel: null,
            falhaRegistrada,
            rQuadrado,
            vidaRemanescenteMeses: 0,
        };
    }

    if (regressao.inclinacao >= 0) {
        return {
            equipamentoId: equipamento.equipamentoId,
            observacoes: observacoes.length,
            ignorado: false,
            motivoIndisponivel: "A inclinação da regressão é não negativa; não há cruzamento previsto.",
            falhaRegistrada,
            rQuadrado,
            vidaRemanescenteMeses: null,
        };
    }

    const ultimoX = pontos[pontos.length - 1][0];
    const cruzamentoX = (0 - regressao.intercepto) / regressao.inclinacao;
    const vidaRemanescenteMeses = Number(
        Math.max(0, cruzamentoX - ultimoX).toFixed(2),
    );

    return {
        equipamentoId: equipamento.equipamentoId,
        observacoes: observacoes.length,
        ignorado: false,
        motivoIndisponivel: null,
        falhaRegistrada,
        rQuadrado,
        vidaRemanescenteMeses,
    };
}

/**
 * Consolida as previsões individuais por tipo, marca e modelo.
 * Medianas reduzem a influência de equipamentos com trajetórias atípicas.
 */
export function calcularGrupoVidaUtil(
    grupo: EquipamentoParaAnaliseVidaUtil[],
    analises: ResultadoEquipamentoVidaUtil[],
    dataReferencia: Date,
): ResultadoPrevisaoVidaUtilDetalhado {
    const primeiroEquipamento = grupo[0];

    if (!primeiroEquipamento) {
        throw new Error("Não há equipamentos observados para consolidar o grupo.");
    }

    const analisesValidas = analises.filter((analise) => !analise.ignorado);
    const vidasPrevistas = analisesValidas
        .map((analise) => analise.vidaRemanescenteMeses)
        .filter((vida): vida is number => vida !== null);
    const valoresRQuadrado = analisesValidas
        .map((analise) => analise.rQuadrado)
        .filter((valor): valor is number => valor !== null);
    const quantidadeFalhas = analises.filter(
        (analise) => analise.falhaRegistrada,
    ).length;
    const taxaFalhas = grupo.length > 0
        ? quantidadeFalhas / grupo.length
        : 0;
    const amostras = analisesValidas.reduce(
        (total, analise) => total + analise.observacoes,
        0,
    );
    const rQuadrado = calcularMedianaSegura(valoresRQuadrado);
    const vidaRemanescenteMeses = calcularMedianaSegura(vidasPrevistas);

    if (vidaRemanescenteMeses === null) {
        const motivoIndisponivel = analisesValidas.length === 0
            ? "Nenhum equipamento atende aos requisitos mínimos de amostras e datas distintas."
            : "Nenhum equipamento possui previsão de cruzamento do índice de condição com zero.";

        return {
            tipoEquipamento: primeiroEquipamento.tipoEquipamento,
            marca: primeiroEquipamento.marca,
            modelo: primeiroEquipamento.modelo,
            amostras,
            metodo: "REGRESSAO_LINEAR",
            rQuadrado,
            vidaRemanescenteMeses: null,
            dataPrevistaInservivel: null,
            equipamentosAnalisados: analisesValidas.length,
            taxaFalhas,
            previsaoDisponivel: false,
            motivoIndisponivel,
        };
    }

    const dataPrevistaInservivel = new Date(
        dataReferencia.getTime() + vidaRemanescenteMeses * MILISSEGUNDOS_POR_MES,
    );

    return {
        tipoEquipamento: primeiroEquipamento.tipoEquipamento,
        marca: primeiroEquipamento.marca,
        modelo: primeiroEquipamento.modelo,
        amostras,
        metodo: "REGRESSAO_LINEAR",
        rQuadrado,
        vidaRemanescenteMeses,
        dataPrevistaInservivel,
        equipamentosAnalisados: analisesValidas.length,
        taxaFalhas,
        previsaoDisponivel: true,
        motivoIndisponivel: null,
    };
}
