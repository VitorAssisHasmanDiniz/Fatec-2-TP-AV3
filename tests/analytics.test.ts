import test from "node:test";
import assert from "node:assert/strict";
import { calcularRegressaoLinear, calcularResumoEstatistico } from "../src/modules/analytics/calculosEstatisticos.js";
import {
    analisarEquipamentoVidaUtil,
    calcularGrupoVidaUtil,
} from "../src/modules/analytics/funcoesVidaUtil.js";
import type {
    EquipamentoParaAnaliseVidaUtil,
    ResultadoEquipamentoVidaUtil,
} from "../src/modules/analytics/tipos.js";
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

function criarEquipamentoVidaUtil(
    equipamentoId: string,
    indices: number[],
    datas: string[],
    falhas: boolean[] = [],
): EquipamentoParaAnaliseVidaUtil {
    return {
        equipamentoId,
        tipoEquipamento: "NOTEBOOK",
        marca: "Marca A",
        modelo: "Modelo A",
        observacoes: indices.map((indiceCondicao, indice) => ({
            observadoEm: new Date(datas[indice] ?? datas[datas.length - 1] ?? "2026-01-01"),
            indiceCondicao,
            falhaRegistrada: falhas[indice] ?? false,
        })),
    };
}

test("prevê vida remanescente por equipamento com reta decrescente perfeita", () => {
    const equipamento = criarEquipamentoVidaUtil(
        "equipamento-1",
        [10, 8, 6],
        ["2026-01-01", "2026-01-31", "2026-03-02"],
    );
    const resultado = analisarEquipamentoVidaUtil(equipamento, 3);

    assert.equal(resultado.ignorado, false);
    assert.equal(resultado.rQuadrado, 1);
    assert.ok(Math.abs((resultado.vidaRemanescenteMeses ?? 0) - 3) < 0.1);
});

test("não prevê vida útil quando a inclinação é positiva", () => {
    const equipamento = criarEquipamentoVidaUtil(
        "equipamento-2",
        [2, 4, 6],
        ["2026-01-01", "2026-01-31", "2026-03-02"],
    );
    const resultado = analisarEquipamentoVidaUtil(equipamento, 3);

    assert.equal(resultado.ignorado, false);
    assert.equal(resultado.vidaRemanescenteMeses, null);
    assert.match(resultado.motivoIndisponivel ?? "", /inclinação/);
});

test("ignora equipamento cujas observações têm datas iguais", () => {
    const equipamento = criarEquipamentoVidaUtil(
        "equipamento-3",
        [10, 8, 6],
        ["2026-01-01", "2026-01-01", "2026-01-01"],
    );
    const resultado = analisarEquipamentoVidaUtil(equipamento, 3);

    assert.equal(resultado.ignorado, true);
    assert.match(resultado.motivoIndisponivel ?? "", /duas datas distintas/);
});

test("registra vida remanescente zero quando a última observação indica falha", () => {
    const equipamento = criarEquipamentoVidaUtil(
        "equipamento-4",
        [10, 8, 6],
        ["2026-01-01", "2026-01-31", "2026-03-02"],
        [false, false, true],
    );
    const resultado = analisarEquipamentoVidaUtil(equipamento, 3);

    assert.equal(resultado.vidaRemanescenteMeses, 0);
    assert.equal(resultado.falhaRegistrada, true);
});

test("ignora equipamento com quantidade de amostras insuficiente", () => {
    const equipamento = criarEquipamentoVidaUtil(
        "equipamento-5",
        [10, 8],
        ["2026-01-01", "2026-02-01"],
    );
    const resultado = analisarEquipamentoVidaUtil(equipamento, 3);

    assert.equal(resultado.ignorado, true);
    assert.match(resultado.motivoIndisponivel ?? "", /Amostras insuficientes/);
});

test("agrega vidas remanescentes pela mediana e taxa de falhas do grupo", () => {
    const dataReferencia = new Date("2026-01-01T00:00:00.000Z");
    const datas = ["2026-01-01", "2026-01-31", "2026-03-02"];
    const grupo = [
        criarEquipamentoVidaUtil("equipamento-6", [10, 8, 6], datas),
        criarEquipamentoVidaUtil("equipamento-7", [10, 8, 6], datas),
        criarEquipamentoVidaUtil(
            "equipamento-8",
            [10, 8, 6],
            datas,
            [false, true, false],
        ),
    ];
    const resultados: ResultadoEquipamentoVidaUtil[] = [
        {
            equipamentoId: "equipamento-6",
            observacoes: 3,
            ignorado: false,
            motivoIndisponivel: null,
            falhaRegistrada: false,
            rQuadrado: 0.8,
            vidaRemanescenteMeses: 2,
        },
        {
            equipamentoId: "equipamento-7",
            observacoes: 3,
            ignorado: false,
            motivoIndisponivel: null,
            falhaRegistrada: false,
            rQuadrado: 0.9,
            vidaRemanescenteMeses: 4,
        },
        {
            equipamentoId: "equipamento-8",
            observacoes: 3,
            ignorado: false,
            motivoIndisponivel: null,
            falhaRegistrada: true,
            rQuadrado: 1,
            vidaRemanescenteMeses: 8,
        },
    ];
    const resultado = calcularGrupoVidaUtil(grupo, resultados, dataReferencia);

    assert.equal(resultado.vidaRemanescenteMeses, 4);
    assert.equal(resultado.rQuadrado, 0.9);
    assert.equal(resultado.equipamentosAnalisados, 3);
    assert.equal(resultado.taxaFalhas, 1 / 3);
    assert.equal(resultado.previsaoDisponivel, true);
});


test("define vida remanescente zero quando o último índice já é inservível", () => {
    const equipamento = criarEquipamentoVidaUtil(
        "equipamento-9",
        [10, 5, 0],
        ["2026-01-01", "2026-01-31", "2026-03-02"],
    );
    const resultado = analisarEquipamentoVidaUtil(equipamento, 3);

    assert.equal(resultado.vidaRemanescenteMeses, 0);
});
