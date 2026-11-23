import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import {
    calcularHashChaveApi,
    gerarChaveApi,
    validarFormatoChaveApi
} from "../src/modules/apiPublica/ServicoChavesApi.js";
import { limitadorChaveApi } from "../src/modules/apiPublica/limitadorChaveApi.js";
import { marcarDepreciacao } from "../src/modules/apiPublica/middlewareVersao.js";
import type { RequisicaoComChaveApi } from "../src/modules/apiPublica/middlewareChaveApi.js";
import errorHandler from "../src/middlewares/errorHandler.js";

let servidorApi: Server;
let servidorLimitador: Server;
let urlApi: string;
let urlLimitador: string;

before(async () => {
    const { default: app } = await import("../src/app.js");
    servidorApi = app.listen(0);
    await new Promise<void>((resolve, reject) => {
        servidorApi.once("listening", resolve);
        servidorApi.once("error", reject);
    });

    const enderecoApi = servidorApi.address();
    if (!enderecoApi || typeof enderecoApi === "string") {
        throw new Error("Não foi possível iniciar o servidor de teste da API pública.");
    }
    urlApi = `http://127.0.0.1:${enderecoApi.port}`;

    const aplicacaoLimitador = express();
    aplicacaoLimitador.use((req, _res, next) => {
        const requisicao = req as RequisicaoComChaveApi;
        requisicao.contextoChaveApi = {
            chaveId: "chave-teste-rate-limit",
            organizacaoId: "ORG-TESTE",
            escopos: ["batches:read"],
            limitePorMinuto: 1
        };
        next();
    });
    aplicacaoLimitador.get("/teste", limitadorChaveApi, (_req, res) => {
        res.json({ nivel: "SUCESSO", mensagem: "Requisição permitida", dados: {} });
    });
    aplicacaoLimitador.get("/depreciacao", marcarDepreciacao("Wed, 31 Dec 2026 23:59:59 GMT"), (_req, res) => {
        res.json({ nivel: "SUCESSO" });
    });
    aplicacaoLimitador.use(errorHandler);

    servidorLimitador = aplicacaoLimitador.listen(0);
    await new Promise<void>((resolve, reject) => {
        servidorLimitador.once("listening", resolve);
        servidorLimitador.once("error", reject);
    });

    const enderecoLimitador = servidorLimitador.address();
    if (!enderecoLimitador || typeof enderecoLimitador === "string") {
        throw new Error("Não foi possível iniciar o servidor de teste do limitador.");
    }
    urlLimitador = `http://127.0.0.1:${enderecoLimitador.port}`;
});

after(async () => {
    for (const servidor of [servidorApi, servidorLimitador]) {
        if (servidor) {
            await new Promise<void>((resolve, reject) => {
                servidor.close((erro) => erro ? reject(erro) : resolve());
            });
        }
    }
});

test("gera uma chave API no formato gc_<prefixo>_<segredo>", () => {
    const primeira = gerarChaveApi();
    const segunda = gerarChaveApi();

    assert.equal(validarFormatoChaveApi(primeira.chave), true);
    assert.equal(primeira.chave.startsWith(`gc_${primeira.prefixo}_`), true);
    assert.equal(primeira.prefixo.length, 8);
    assert.notEqual(primeira.chave, segunda.chave);
});

test("rejeita formatos de chave API inválidos", () => {
    assert.equal(validarFormatoChaveApi(""), false);
    assert.equal(validarFormatoChaveApi("gc_prefixo_segredo"), false);
    assert.equal(validarFormatoChaveApi(`gc_${"a".repeat(8)}_${"z".repeat(64)}`), false);
    assert.equal(validarFormatoChaveApi(`gc_${"a".repeat(8)}_${"a".repeat(63)}`), false);
});

test("calcula hash SHA-256 determinístico sem retornar a chave original", () => {
    const chave = `gc_${"a".repeat(8)}_${"b".repeat(64)}`;
    const hash = calcularHashChaveApi(chave);

    assert.equal(hash.length, 64);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hash, calcularHashChaveApi(chave));
    assert.notEqual(hash, chave);
});

test("endpoint público informa chave ausente com HTTP 401", async () => {
    const resposta = await fetch(`${urlApi}/api/v1/public/lotes`);
    const corpo = await resposta.json() as { nivel: string; codigo: string };

    assert.equal(resposta.status, 401);
    assert.equal(corpo.nivel, "ERRO");
    assert.equal(corpo.codigo, "CHAVE_AUSENTE");
});

test("endpoint público rejeita chave com formato inválido", async () => {
    const resposta = await fetch(`${urlApi}/api/v1/public/lotes`, {
        headers: { "X-API-Key": "chave-invalida" }
    });
    const corpo = await resposta.json() as { nivel: string; codigo: string };

    assert.equal(resposta.status, 401);
    assert.equal(corpo.nivel, "ERRO");
    assert.equal(corpo.codigo, "CHAVE_INVALIDA");
});

test("documentação OpenAPI pública não exige chave e não expõe rotas internas", async () => {
    const resposta = await fetch(`${urlApi}/api/v1/public/docs.json`);
    const documento = await resposta.json() as {
        servers: Array<{ url: string }>;
        paths: Record<string, unknown>;
    };

    assert.equal(resposta.status, 200);
    assert.equal(documento.servers[0]?.url, "/api/v1/public");
    assert.ok("/lotes" in documento.paths);
    assert.equal("/organizacoes" in documento.paths, false);
});

test("respostas da API pública incluem a versão no cabeçalho", async () => {
    const resposta = await fetch(`${urlApi}/api/v1/public/lotes`);

    assert.equal(resposta.headers.get("X-API-Version"), "1");
});

test("limitador responde HTTP 429 ao exceder o limite configurado por chave", async () => {
    const primeira = await fetch(`${urlLimitador}/teste`);
    const segunda = await fetch(`${urlLimitador}/teste`);
    const corpo = await segunda.json() as { nivel: string; codigo: string };

    assert.equal(primeira.status, 200);
    assert.equal(segunda.status, 429);
    assert.equal(corpo.nivel, "ERRO");
    assert.equal(corpo.codigo, "LIMITE_EXCEDIDO");
});

test("helper de depreciação define os cabeçalhos Deprecation e Sunset", async () => {
    const resposta = await fetch(`${urlLimitador}/depreciacao`);

    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get("Deprecation"), "true");
    assert.equal(resposta.headers.get("Sunset"), "Wed, 31 Dec 2026 23:59:59 GMT");
});

test.todo("criação persistida da chave API com auditoria requer PostgreSQL de teste e fixtures");
test.todo("revogação persistida da chave API requer PostgreSQL de teste e fixtures");
test.todo("rotação revoga a chave anterior e cria uma nova requer PostgreSQL de teste e fixtures");
test.todo("chave válida sem o escopo exigido retorna 403 requer PostgreSQL de teste e fixtures");
test.todo("recurso de outra organização retorna 404 requer PostgreSQL de teste e fixtures");
