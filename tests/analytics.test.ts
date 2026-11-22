import test from "node:test";
import assert from "node:assert/strict";
import { calcularRegressaoLinear, calcularResumoEstatistico } from "../src/modules/analytics/calculosEstatisticos.js";

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
