import test from "node:test";
import assert from "node:assert/strict";
import { calcularRegressaoLinear, calcularResumoEstatistico } from "../src/modules/analytics/calculosEstatisticos.js";
import {
    agruparRegistros,
    calcularJanelaPeriodoAnterior,
    calcularResultados,
} from "../src/modules/analytics/funcoesAnaliticas.js";

test("calcula média, mediana e desvio padrão de uma amostra fixa", () => {
  const resultado = calcularResumoEstatistico([2, 4, 4, 4, 5, 5, 7, 9]);

  assert.equal(resultado.quantidade, 8);
  assert.equal(resultado.media, 5);
  assert.equal(resultado.mediana, 4.5);
  assert.equal(resultado.desvioPadrao, Math.sqrt(4));
});

test("retorna medidas zeradas para uma amostra vazia", () => {
  assert.deepEqual(calcularResumoEstatistico([]), {
    quantidade: 0,
    media: 0,
    mediana: 0,
    desvioPadrao: 0,
  });
});

test("retorna desvio padrão zero para uma única observação", () => {
  assert.deepEqual(calcularResumoEstatistico([12]), {
    quantidade: 1,
    media: 12,
    mediana: 12,
    desvioPadrao: 0,
  });
});

test("rejeita amostras com valores não finitos", () => {
  assert.throws(() => calcularResumoEstatistico([1, Number.NaN]), /valores numéricos inválidos/);
});

test("ajusta uma regressão linear perfeita e calcula R² igual a 1", () => {
  const resultado = calcularRegressaoLinear([[0, 10], [1, 8], [2, 6], [3, 4]]);

  assert.equal(resultado.inclinacao, -2);
  assert.equal(resultado.intercepto, 10);
  assert.equal(resultado.coeficienteDeterminacao, 1);
  assert.equal(resultado.prever(4), 2);
});

test("rejeita regressão com menos de duas amostras", () => {
  assert.throws(() => calcularRegressaoLinear([[0, 10]]), /pelo menos duas amostras/);
});

test("rejeita regressão sem variação no eixo de entrada", () => {
  assert.throws(() => calcularRegressaoLinear([[1, 2], [1, 3]]), /valores de entrada distintos/);
});

test("rejeita coordenadas inválidas na regressão", () => {
  assert.throws(() => calcularRegressaoLinear([[0, 1], [1, Number.POSITIVE_INFINITY]]), /coordenadas inválidas/);
});

test("calcula período anterior com a mesma duração exata do intervalo", () => {
    const inicio = new Date("2026-03-10T12:00:00.000Z");
    const fim = new Date("2026-04-25T18:30:00.000Z");
    const janela = calcularJanelaPeriodoAnterior(inicio, fim);

    assert.equal(janela.fim.getTime(), inicio.getTime());
    assert.equal(
        janela.fim.getTime() - janela.inicio.getTime(),
        fim.getTime() - inicio.getTime(),
    );
});

test("agrupa marca e modelo vazios como NÃO INFORMADO", () => {
    const grupos = agruparRegistros([
        {
            valorRecuperacao: 100,
            equipamento: {
                tipo: "NOTEBOOK",
                estadoFisico: "BOM_ESTADO",
                marca: "",
                modelo: "",
            },
        },
        {
            valorRecuperacao: 200,
            equipamento: {
                tipo: "NOTEBOOK",
                estadoFisico: "BOM_ESTADO",
                marca: " ",
                modelo: "",
            },
        },
    ]);

    assert.equal(grupos.length, 1);
    assert.equal(grupos[0]?.marca, "NÃO INFORMADO");
    assert.equal(grupos[0]?.modelo, "NÃO INFORMADO");
    assert.deepEqual(grupos[0]?.valores, [100, 200]);
});

test("ordena ranking por média decrescente e desempata pelo total", () => {
    const resultados = calcularResultados([
        {
            tipoEquipamento: "NOTEBOOK",
            estadoFisico: "BOM_ESTADO",
            marca: "Marca A",
            modelo: "Modelo A",
            valores: [100, 100],
        },
        {
            tipoEquipamento: "NOTEBOOK",
            estadoFisico: "BOM_ESTADO",
            marca: "Marca B",
            modelo: "Modelo B",
            valores: [200],
        },
        {
            tipoEquipamento: "MONITOR",
            estadoFisico: "NOVO",
            marca: "Marca C",
            modelo: "Modelo C",
            valores: [150, 150],
        },
        {
            tipoEquipamento: "MONITOR",
            estadoFisico: "NOVO",
            marca: "Marca D",
            modelo: "Modelo D",
            valores: [150],
        },
    ]);

    assert.deepEqual(
        resultados.map((resultado) => resultado.valorMedioRecuperacao),
        [200, 150, 150, 100],
    );
    assert.deepEqual(
        resultados.map((resultado) => resultado.posicaoRanking),
        [1, 2, 3, 4],
    );
    assert.equal(resultados[1]?.valorTotalRecuperacao, 300);
    assert.equal(resultados[2]?.valorTotalRecuperacao, 150);
});
