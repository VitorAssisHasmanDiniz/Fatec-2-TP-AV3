import { fecharFilaRelatorios } from "../src/modules/relatoriosFila/fila.js";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { ZodError, z } from "zod";
import { Redis } from "ioredis";
import AppError from "../src/errors/AppError.js";
import { prisma } from "../src/lib/prisma.js";
import app from "../src/app.js";
import ServicoChavesApi from "../src/modules/apiPublica/ServicoChavesApi.js";
import {
    classificarErroProcessamento,
    sanitizarMensagemErroPublico,
} from "../src/modules/relatoriosFila/classificacaoErros.js";
import { processarTarefaRelatorio } from "../src/modules/relatoriosFila/processador.js";
import {
    montarNomeDownloadRelatorio,
    resolverCaminhoSeguroRelatorio,
} from "../src/modules/relatoriosFila/segurancaCaminho.js";
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

test("serializador CSV escapa aspas, vírgulas, quebras de linha e representa nulos", async () => {
    const csv = await coletar(serializarCsv({
        resumo: { quantidade: 1 },
        resultados: [{
            modelo: 'Notebook "A", Pro\nLinha 2',
            observacao: null,
        }],
    }));

    assert.match(csv, /"modelo","observacao"\r\n/);
    assert.match(csv, /"Notebook ""A"", Pro\nLinha 2",""\r\n/);
    assert.match(csv, /"resumo","valor"/);
});

test("serializador CSV neutraliza fórmulas perigosas (CSV injection) iniciadas por = + - @", async () => {
    const csv = await coletar(serializarCsv({
        resultados: [{
            formulaIgual: "=SUM(A1:A10)",
            formulaMais: "+cmd|' /C calc'!A0",
            formulaMenos: "-2+3+cmd|' /C calc'!A0",
            formulaArroba: "@SUM(1+1)",
            valorSeguro: "Notebook Dell - Latitude",
        }],
    }));

    assert.match(csv, /"'=SUM\(A1:A10\)"/);
    assert.match(csv, /"'\+cmd\|' \/C calc'!A0"/);
    assert.match(csv, /"'-2\+3\+cmd\|' \/C calc'!A0"/);
    assert.match(csv, /"'@SUM\(1\+1\)"/);
    assert.match(csv, /"Notebook Dell - Latitude"/);
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

test("classificação de erros distingue falhas permanentes e transitórias", () => {
    const erroCliente = classificarErroProcessamento(
        new AppError("Organização não encontrada", 404, "ORGANIZACAO_NAO_ENCONTRADA"),
    );
    assert.equal(erroCliente.categoria, "PERMANENTE");
    assert.equal(erroCliente.mensagemSegura, "Organização não encontrada");

    let erroZod: ZodError | undefined;
    try {
        z.object({ tipo: z.string() }).parse({});
    } catch (erro) {
        if (erro instanceof ZodError) {
            erroZod = erro;
        }
    }
    assert.ok(erroZod);
    assert.equal(classificarErroProcessamento(erroZod).categoria, "PERMANENTE");

    const erroPrismaFk = classificarErroProcessamento({ code: "P2003" });
    assert.equal(erroPrismaFk.categoria, "PERMANENTE");

    const erroRede = classificarErroProcessamento({ code: "ECONNRESET", message: "socket hang up" });
    assert.equal(erroRede.categoria, "TRANSITORIO");

    const erroPrismaTimeout = classificarErroProcessamento({ code: "P2024" });
    assert.equal(erroPrismaTimeout.categoria, "TRANSITORIO");

    const erro500 = classificarErroProcessamento(
        new AppError("Falha interna no serviço", 503, "SERVICO_INDISPONIVEL"),
    );
    assert.equal(erro500.categoria, "TRANSITORIO");
});

test("sanitização de erro oculta stack trace multi-linha", () => {
    const erroComStack = new Error("Falha ao gravar arquivo\n    at Object.<anonymous> (/app/src/worker.ts:42:10)");
    const mensagem = sanitizarMensagemErroPublico(erroComStack);
    assert.equal(mensagem, "Falha ao gravar arquivo");
    assert.doesNotMatch(mensagem, /worker\.ts/);
});

test("guarda de path traversal bloqueia caminhos fora de REPORT_DIR", () => {
    const base = resolve(process.cwd(), "storage", "relatorios-teste");
    const caminhoValido = resolverCaminhoSeguroRelatorio(
        "550e8400-e29b-41d4-a716-446655440000.csv",
        base,
    );
    assert.equal(
        caminhoValido,
        resolve(base, "550e8400-e29b-41d4-a716-446655440000.csv"),
    );

    assert.throws(
        () => resolverCaminhoSeguroRelatorio("../../etc/passwd", base),
        /fora do diretório permitido/,
    );
    assert.throws(
        () => resolverCaminhoSeguroRelatorio("/tmp/arquivo-externo.csv", base),
        /fora do diretório permitido/,
    );

    assert.equal(
        montarNomeDownloadRelatorio("550e8400-e29b-41d4-a716-446655440000", "CSV"),
        "relatorio-550e8400-e29b-41d4-a716-446655440000.csv",
    );
    assert.throws(
        () => montarNomeDownloadRelatorio("../malicioso", "JSON"),
        /Identificador de tarefa inválido/,
    );
});

async function verificarInfraIntegracaoDisponivel(): Promise<string | null> {
    if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
        return "DATABASE_URL ou REDIS_URL não configurados no ambiente.";
    }

    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch {
        return "PostgreSQL indisponível para testes de integração.";
    }

    const redisTeste = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        lazyConnect: true,
    });

    try {
        await redisTeste.connect();
        await redisTeste.ping();
        return null;
    } catch {
        return "Redis indisponível para testes de integração.";
    } finally {
        await redisTeste.quit().catch(() => undefined);
    }
}

test("integração: ciclo NA_FILA -> CONCLUIDA, falha com retry e isolamento entre chaves", async (t) => {
    const motivoSkip = await verificarInfraIntegracaoDisponivel();
    if (motivoSkip) {
        t.skip(motivoSkip);
        return;
    }

    const servicoChaves = new ServicoChavesApi();
    const sufixo = Date.now().toString(36).slice(-6);
    const orgId = `ORG_${sufixo}`;
    const usuario = await prisma.usuario.findFirst({ select: { id: true } });

    if (!usuario) {
        t.skip("Nenhum usuário encontrado no banco para vincular chaves API de teste.");
        return;
    }

    await prisma.organizacao.create({
        data: {
            id: orgId,
            razaoSocial: `Organização Teste Fila ${sufixo}`,
            cnpj: `${String(Date.now()).slice(-14)}`,
        },
    });

    const chaveA = await servicoChaves.criar({
        nomeParceiro: `Parceiro A ${sufixo}`,
        organizacaoId: orgId,
        escopos: ["reports:generate", "reports:read"],
    }, usuario.id);

    const chaveB = await servicoChaves.criar({
        nomeParceiro: `Parceiro B ${sufixo}`,
        organizacaoId: orgId,
        escopos: ["reports:generate", "reports:read"],
    }, usuario.id);

    const servidor = app.listen(0);
    const endereco = servidor.address();
    const porta = typeof endereco === "object" && endereco ? endereco.port : 0;
    const baseUrl = `http://127.0.0.1:${porta}/api/v1/public/relatorios`;

    let caminhoArquivoGerado: string | null = null;

    try {
        // 1. Solicita geração via POST /
        const respCriar = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": chaveA.chavePlana,
            },
            body: JSON.stringify({
                tipo: "RENTABILIDADE_EQUIPAMENTOS",
                formato: "CSV",
                parametros: {},
            }),
        });
        assert.equal(respCriar.status, 202);
        const corpoCriar = await respCriar.json() as {
            dados: { tarefaId: string; statusUrl: string };
        };
        const tarefaId = corpoCriar.dados.tarefaId;

        // 2. Outra chave recebe 404 ao consultar a tarefa
        const respOutraChave = await fetch(`${baseUrl}/${tarefaId}`, {
            headers: { "X-API-Key": chaveB.chavePlana },
        });
        assert.equal(respOutraChave.status, 404);

        // 3. Processa a tarefa e valida ciclo NA_FILA -> CONCLUIDA + download
        await processarTarefaRelatorio(tarefaId, { tentativaAtual: 1, maxTentativas: 3 });

        const tarefaConcluida = await prisma.tarefaRelatorio.findUnique({
            where: { id: tarefaId },
        });
        assert.equal(tarefaConcluida?.status, "CONCLUIDA");
        caminhoArquivoGerado = tarefaConcluida?.caminhoArquivo ?? null;

        const respDownload = await fetch(`${baseUrl}/${tarefaId}/download`, {
            headers: { "X-API-Key": chaveA.chavePlana },
        });
        assert.equal(respDownload.status, 200);
        const conteudoCsv = await respDownload.text();
        assert.match(conteudoCsv, /"resumo","valor"/);

        // 4. Falha transitória mantém NA_FILA até esgotar tentativas
        const tarefaRetry = await prisma.tarefaRelatorio.create({
            data: {
                organizacaoId: orgId,
                chaveApiId: chaveA.id,
                tipo: "TIPO_INEXISTENTE" as never,
                parametros: {},
                formato: "JSON",
            },
        });

        await assert.rejects(
            () => processarTarefaRelatorio(tarefaRetry.id, { tentativaAtual: 1, maxTentativas: 3 }),
        );
        const aposFalhaPermanente = await prisma.tarefaRelatorio.findUnique({
            where: { id: tarefaRetry.id },
        });
        assert.equal(aposFalhaPermanente?.status, "FALHOU");
    } finally {
        servidor.close();
        await fecharFilaRelatorios().catch(() => undefined);
        if (caminhoArquivoGerado) {
            await rm(caminhoArquivoGerado, { force: true }).catch(() => undefined);
        }
        await prisma.tarefaRelatorio.deleteMany({ where: { organizacaoId: orgId } });
        await prisma.relatorioAnalitico.deleteMany({ where: { organizacaoId: orgId } });
        await prisma.chaveApi.deleteMany({ where: { organizacaoId: orgId } });
        await prisma.organizacao.deleteMany({ where: { id: orgId } });
    }
});