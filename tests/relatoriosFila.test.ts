import assert from "node:assert/strict";
import test from "node:test";
import {
    serializarCsv,
    serializarJson,
} from "../src/modules/relatoriosFila/serializadores.js";

async function coletar(conteudo: AsyncGenerator<string>): Promise<string> {
    let resultado = "";
    for await (const parte of conteudo) {
        resultado += parte;
    }
    return resultado;
}

test("serializador JSON mantém metadados e percorre resultados incrementalmente", async () => {
    const resultado = {
        tipo: "RENTABILIDADE_EQUIPAMENTOS",
        geradoEm: new Date("2026-01-01T00:00:00.000Z"),
        resumo: { quantidadeRegistros: 1 },
        resultados: [{ modelo: "Notebook", quantidade: 1 }],
    };

    const json = await coletar(serializarJson(resultado));
    assert.deepEqual(JSON.parse(json), {
        ...resultado,
        geradoEm: "2026-01-01T00:00:00.000Z",
    });
});

test("serializador CSV escapa aspas e representa valores nulos", async () => {
    const csv = await coletar(serializarCsv({
        resumo: { quantidade: 1 },
        resultados: [{ modelo: 'Notebook "A"', observacao: null }],
    }));

    assert.match(csv, /"modelo","observacao"\r\n/);
    assert.match(csv, /"Notebook ""A""",""\r\n/);
    assert.match(csv, /"resumo","valor"/);
});

test("serializadores rejeitam resultado sem lista de registros", async () => {
    await assert.rejects(
        () => coletar(serializarCsv({ resumo: {} })),
        /não contém uma lista de resultados/,
    );
    await assert.rejects(
        () => coletar(serializarJson(null)),
        /deve ser um objeto/,
    );
});
