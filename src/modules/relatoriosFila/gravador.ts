import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { serializarCsv, serializarJson } from "./serializadores.js";

interface OpcoesGravacao {
    tarefaId: string;
    formato: "CSV" | "JSON";
    resultado: unknown;
}

interface ArquivoGerado {
    caminho: string;
    tamanhoBytes: bigint;
}

function obterDiretorioRelatorios(): string {
    const configurado = process.env.REPORT_DIR?.trim() || "storage/relatorios";
    return isAbsolute(configurado) ? resolve(configurado) : resolve(process.cwd(), configurado);
}

export async function gravarArquivoRelatorio(
    opcoes: OpcoesGravacao,
): Promise<ArquivoGerado> {
    if (!/^[a-f\d-]{36}$/i.test(opcoes.tarefaId)) {
        throw new Error("Identificador da tarefa inválido para gerar o arquivo.");
    }

    const diretorio = obterDiretorioRelatorios();
    await mkdir(diretorio, { recursive: true });

    const extensao = opcoes.formato.toLowerCase();
    const nomeArquivo = `${opcoes.tarefaId}.${extensao}`;
    const caminho = resolve(diretorio, basename(nomeArquivo));

    if (!caminho.startsWith(`${diretorio}${sep}`)) {
        throw new Error("O caminho de destino do relatório é inválido.");
    }

    const partes = opcoes.formato === "CSV"
        ? serializarCsv(opcoes.resultado)
        : serializarJson(opcoes.resultado);

    await pipeline(
        Readable.from(partes),
        createWriteStream(caminho, { encoding: "utf8" }),
    );

    const informacoes = await stat(caminho);
    return {
        caminho,
        tamanhoBytes: BigInt(informacoes.size),
    };
}
