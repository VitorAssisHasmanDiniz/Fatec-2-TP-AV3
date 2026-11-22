import {
    linearRegression,
    linearRegressionLine,
    mean,
    median,
    rSquared,
    standardDeviation,
} from "simple-statistics";

export interface ResumoEstatistico {
    quantidade: number;
    media: number;
    mediana: number;
    desvioPadrao: number;
}

export interface ResultadoRegressaoLinear {
    inclinacao: number;
    intercepto: number;
    coeficienteDeterminacao: number;
    prever: (valor: number) => number;
}

/** Calcula medidas descritivas de uma amostra numérica. */
export function calcularResumoEstatistico(valores: number[]): ResumoEstatistico {
    if (valores.length === 0) {
        return { quantidade: 0, media: 0, mediana: 0, desvioPadrao: 0 };
    }

    if (valores.some((valor) => !Number.isFinite(valor))) {
        throw new Error("A amostra contém valores numéricos inválidos.");
    }

    return {
        quantidade: valores.length,
        media: mean(valores),
        mediana: median(valores),
        desvioPadrao: valores.length > 1 ? standardDeviation(valores) : 0,
    };
}

/** Calcula a mediana de uma amostra, retornando null quando ela está vazia. */
export function calcularMedianaSegura(valores: number[]): number | null {
    if (valores.length === 0) {
        return null;
    }

    if (valores.some((valor) => !Number.isFinite(valor))) {
        throw new Error("A amostra contém valores numéricos inválidos.");
    }

    return median(valores);
}

/** Ajusta uma reta por mínimos quadrados e calcula seu R². */
export function calcularRegressaoLinear(
    pontos: [number, number][],
): ResultadoRegressaoLinear {
    if (pontos.length < 2) {
        throw new Error("A regressão linear exige pelo menos duas amostras.");
    }

    if (pontos.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
        throw new Error("A regressão contém coordenadas inválidas.");
    }

    if (pontos.every(([x]) => x === pontos[0][0])) {
        throw new Error("A regressão exige valores de entrada distintos.");
    }

    const regressao = linearRegression(pontos);
    const linha = linearRegressionLine(regressao);

    return {
        inclinacao: regressao.m,
        intercepto: regressao.b,
        coeficienteDeterminacao: rSquared(pontos, linha),
        prever: linha,
    };
}
