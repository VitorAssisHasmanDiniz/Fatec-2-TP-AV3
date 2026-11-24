import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import app from "../src/app.js";
import AppError from "../src/errors/AppError.js";
import { prisma } from "../src/lib/prisma.js";
import ServicoChavesApi, {
    calcularHashChaveApi,
    gerarChaveApi,
    validarFormatoChaveApi,
} from "../src/modules/apiPublica/ServicoChavesApi.js";
import { marcarDepreciacao } from "../src/modules/apiPublica/middlewareVersao.js";

function criarTokenAdmin(usuarioId: string): string {
    const segredo = process.env.JWT_SECRET || "troque-esta-chave-secreta-em-producao";
    return jwt.sign({ papel: "ADMINISTRADOR" }, segredo, {
        subject: usuarioId,
        expiresIn: "15m",
    });
}

async function verificarPostgresTesteDisponivel(): Promise<string | null> {
    if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
        return "TEST_DATABASE_URL ou DATABASE_URL não configurado no ambiente.";
    }
    try {
        await prisma.$queryRaw`SELECT 1`;
        return null;
    } catch {
        return "PostgreSQL indisponível para testes de integração.";
    }
}

test("gera uma chave API no formato gc_<prefixo>_<segredo>", () => {
    const { chave, prefixo } = gerarChaveApi();

    assert.equal(prefixo.length, 8);
    assert.ok(chave.startsWith(`gc_${prefixo}_`));
    assert.equal(validarFormatoChaveApi(chave), true);
});

test("rejeita formatos de chave API inválidos", () => {
    assert.equal(validarFormatoChaveApi(""), false);
    assert.equal(validarFormatoChaveApi("gc_123_abc"), false);
    assert.equal(validarFormatoChaveApi("gc_ZZZZZZZZ_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), false);
    assert.equal(validarFormatoChaveApi(`gc_12345678_${"a".repeat(63)}`), false);
});

test("calcula hash SHA-256 determinístico sem retornar a chave original", () => {
    const { chave } = gerarChaveApi();
    const primeiroHash = calcularHashChaveApi(chave);
    const segundoHash = calcularHashChaveApi(chave);

    assert.equal(primeiroHash.length, 64);
    assert.equal(primeiroHash, segundoHash);
    assert.notEqual(primeiroHash, chave);
});

test("endpoint público informa chave ausente com HTTP 401", async (t) => {
    const servidor = app.listen(0);
    t.after(() => servidor.close());
    const endereco = servidor.address();
    assert.ok(endereco && typeof endereco !== "string");

    const resposta = await fetch(`http://127.0.0.1:${endereco.port}/api/v1/public/lotes`);
    const corpo = await resposta.json() as { nivel: string; codigo: string };

    assert.equal(resposta.status, 401);
    assert.equal(corpo.nivel, "ERRO");
    assert.equal(corpo.codigo, "CHAVE_AUSENTE");
});

test("endpoint público rejeita chave com formato inválido", async (t) => {
    const servidor = app.listen(0);
    t.after(() => servidor.close());
    const endereco = servidor.address();
    assert.ok(endereco && typeof endereco !== "string");

    const resposta = await fetch(`http://127.0.0.1:${endereco.port}/api/v1/public/lotes`, {
        headers: { "X-API-Key": "chave-invalida" },
    });
    const corpo = await resposta.json() as { nivel: string; codigo: string };

    assert.equal(resposta.status, 401);
    assert.equal(corpo.nivel, "ERRO");
    assert.equal(corpo.codigo, "CHAVE_INVALIDA");
});

test("documentação OpenAPI pública não exige chave e não expõe rotas internas", async (t) => {
    const servidor = app.listen(0);
    t.after(() => servidor.close());
    const endereco = servidor.address();
    assert.ok(endereco && typeof endereco !== "string");

    const resposta = await fetch(`http://127.0.0.1:${endereco.port}/api/v1/public/docs.json`);
    const documento = await resposta.json() as {
        openapi: string;
        paths: Record<string, unknown>;
    };

    assert.equal(resposta.status, 200);
    assert.equal(documento.openapi, "3.0.3");
    assert.ok("/rastreabilidade/equipamentos/{codigoBarras}" in documento.paths);
    assert.ok("/lotes" in documento.paths);
    assert.ok("/lotes/{id}" in documento.paths);
    assert.ok("/relatorios" in documento.paths);
    assert.ok("/relatorios/{id}" in documento.paths);
    assert.ok("/relatorios/{id}/download" in documento.paths);
    assert.equal(Object.keys(documento.paths).some((rota) => rota.includes("internal") || rota.includes("admin")), false);
});

test("respostas da API pública incluem a versão no cabeçalho", async (t) => {
    const servidor = app.listen(0);
    t.after(() => servidor.close());
    const endereco = servidor.address();
    assert.ok(endereco && typeof endereco !== "string");

    const resposta = await fetch(`http://127.0.0.1:${endereco.port}/api/v1/public/lotes`);
    assert.equal(resposta.headers.get("x-api-version"), "1.0.0");
});

test("limitador responde HTTP 429 ao exceder o limite configurado por chave", async () => {
    const limitador = rateLimit({
        windowMs: 60 * 1000,
        limit: 2,
        keyGenerator: () => "chave-teste-limite",
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, _res, next) => {
            next(new AppError("Limite de requisições da chave API excedido", 429, "LIMITE_EXCEDIDO"));
        },
    });

    const executar = () => new Promise<unknown>((resolve) => {
        limitador(
            { ip: "127.0.0.1", headers: {}, app: { get: () => false } } as never,
            { setHeader: () => undefined, getHeader: () => undefined } as never,
            (erro?: unknown) => resolve(erro ?? null),
        );
    });

    assert.equal(await executar(), null);
    assert.equal(await executar(), null);
    const terceiro = await executar();
    assert.ok(terceiro instanceof AppError);
    assert.equal(terceiro.statusCode, 429);
    assert.equal(terceiro.codigo, "LIMITE_EXCEDIDO");
});

test("helper de depreciação define os cabeçalhos Deprecation e Sunset", () => {
    const cabecalhos = new Map<string, string>();
    const middleware = marcarDepreciacao("Wed, 31 Dec 2026 23:59:59 GMT", "/api/v2/public/lotes");
    let proximoChamado = false;

    middleware(
        {} as never,
        { setHeader: (nome: string, valor: string) => cabecalhos.set(nome, valor) } as never,
        () => { proximoChamado = true; },
    );

    assert.equal(proximoChamado, true);
    assert.equal(cabecalhos.get("Deprecation"), "true");
    assert.equal(cabecalhos.get("Sunset"), "Wed, 31 Dec 2026 23:59:59 GMT");
    assert.equal(cabecalhos.get("Link"), '</api/v2/public/lotes>; rel="successor-version"');
});

test("integração: criação, revogação, rotação, escopo 403 e isolamento entre organizações", async (t) => {
    const motivoSkip = await verificarPostgresTesteDisponivel();
    if (motivoSkip) {
        t.skip(motivoSkip);
        return;
    }

    const sufixo = Date.now().toString(36).slice(-6);
    const orgAId = `ORGA_${sufixo}`;
    const orgBId = `ORGB_${sufixo}`;
    const senhaHash = await bcrypt.hash("SenhaForte123!", 4);

    const admin = await prisma.usuario.create({
        data: {
            nome: `Admin Teste ${sufixo}`,
            usuario: `adm_${sufixo}`,
            senhaHash,
            papel: "ADMINISTRADOR",
        },
    });

    await prisma.organizacao.createMany({
        data: [
            { id: orgAId, razaoSocial: `Org A ${sufixo}`, cnpj: `${String(Date.now()).slice(-14)}` },
            { id: orgBId, razaoSocial: `Org B ${sufixo}`, cnpj: `${String(Date.now() + 1).slice(-14)}` },
        ],
    });

    const loteOrgB = await prisma.lote.create({
        data: {
            id: `LOTE-B-${sufixo}`,
            organizacaoId: orgBId,
            notaFiscal: "NF-ORG-B",
            transportadora: "Transp B",
        },
    });

    const servidor = app.listen(0);
    const endereco = servidor.address();
    assert.ok(endereco && typeof endereco !== "string");
    const baseAdmin = `http://127.0.0.1:${endereco.port}/api/v1/admin/chaves-api`;
    const basePublica = `http://127.0.0.1:${endereco.port}/api/v1/public`;
    const tokenAdmin = criarTokenAdmin(admin.id);
    const servicoChaves = new ServicoChavesApi();

    try {
        // 1. Criação persistida via rota admin + auditoria
        const respCriar = await fetch(baseAdmin, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenAdmin}`,
            },
            body: JSON.stringify({
                nomeParceiro: `Parceiro Org A ${sufixo}`,
                organizacaoId: orgAId,
                escopos: ["batches:read"],
                plano: "BASICO",
                limitePorMinuto: 60,
            }),
        });
        assert.equal(respCriar.status, 201);
        const corpoCriar = await respCriar.json() as {
            dados: { id: string; chave: string; segredoWebhook: string; prefixo: string };
        };
        assert.equal(validarFormatoChaveApi(corpoCriar.dados.chave), true);
        assert.equal(corpoCriar.dados.segredoWebhook.length, 64);

        const auditoriaCriacao = await prisma.registroAuditoria.findFirst({
            where: { entidade: "ChaveApi", entidadeId: corpoCriar.dados.id, acao: "CRIAR_CHAVE_API" },
        });
        assert.ok(auditoriaCriacao);

        // 2. Chave válida sem escopo batches:write retorna 403
        const respSemEscopo = await fetch(`${basePublica}/lotes`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": corpoCriar.dados.chave,
            },
            body: JSON.stringify({ nf: "NF-1", transp: "Transp 1" }),
        });
        assert.equal(respSemEscopo.status, 403);

        // 3. Recurso de outra organização retorna 404
        const respOutraOrg = await fetch(`${basePublica}/lotes/${loteOrgB.id}`, {
            headers: { "X-API-Key": corpoCriar.dados.chave },
        });
        assert.equal(respOutraOrg.status, 404);

        // 4. Rotação revoga chave anterior e emite nova
        const rotacionada = await servicoChaves.rotacionar(corpoCriar.dados.id, admin.id);
        assert.notEqual(rotacionada.chave, corpoCriar.dados.chave);

        const respAntiga = await fetch(`${basePublica}/lotes`, {
            headers: { "X-API-Key": corpoCriar.dados.chave },
        });
        assert.equal(respAntiga.status, 401);

        const respNova = await fetch(`${basePublica}/lotes`, {
            headers: { "X-API-Key": rotacionada.chave },
        });
        assert.equal(respNova.status, 200);

        // 5. Revogação persistida bloqueia uso subsequente
        await servicoChaves.revogar(rotacionada.id, admin.id);
        const respRevogada = await fetch(`${basePublica}/lotes`, {
            headers: { "X-API-Key": rotacionada.chave },
        });
        assert.equal(respRevogada.status, 401);
    } finally {
        servidor.close();
        await prisma.registroAuditoria.deleteMany({ where: { usuarioId: admin.id } });
        await prisma.chaveApi.deleteMany({ where: { organizacaoId: { in: [orgAId, orgBId] } } });
        await prisma.lote.deleteMany({ where: { organizacaoId: { in: [orgAId, orgBId] } } });
        await prisma.organizacao.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
        await prisma.usuario.deleteMany({ where: { id: admin.id } });
    }
});
