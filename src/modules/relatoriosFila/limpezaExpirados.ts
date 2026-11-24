import { unlink } from "node:fs/promises";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { resolverCaminhoSeguroRelatorio } from "./segurancaCaminho.js";

function obterDiasRetencao(): number {
    const valor = Number.parseInt(process.env.REPORT_RETENCAO_DIAS || "7", 10);
    return Number.isFinite(valor) && valor >= 1 ? valor : 7;
}

export async function limparRelatoriosExpirados(agora: Date = new Date()): Promise<number> {
    const diasRetencao = obterDiasRetencao();
    const limiteCriacaoSemExpiracao = new Date(
        agora.getTime() - diasRetencao * 24 * 60 * 60 * 1000,
    );

    const tarefasExpiradas = await prisma.tarefaRelatorio.findMany({
        where: {
            OR: [
                { expiraEm: { lte: agora } },
                {
                    expiraEm: null,
                    status: { in: ["CONCLUIDA", "FALHOU"] },
                    criadoEm: { lte: limiteCriacaoSemExpiracao },
                },
            ],
        },
        select: {
            id: true,
            caminhoArquivo: true,
        },
    });

    if (tarefasExpiradas.length === 0) {
        return 0;
    }

    const idsParaRemover: string[] = [];

    for (const tarefa of tarefasExpiradas) {
        if (tarefa.caminhoArquivo) {
            try {
                const caminhoSeguro = resolverCaminhoSeguroRelatorio(tarefa.caminhoArquivo);
                await unlink(caminhoSeguro);
            } catch (erro) {
                const codigo = typeof erro === "object" && erro !== null && "code" in erro
                    ? String((erro as { code?: unknown }).code)
                    : undefined;

                if (codigo !== "ENOENT") {
                    logger.warn(
                        { err: erro, tarefaId: tarefa.id },
                        "Não foi possível remover arquivo expirado de relatório.",
                    );
                }
            }
        }

        idsParaRemover.push(tarefa.id);
    }

    const resultado = await prisma.tarefaRelatorio.deleteMany({
        where: { id: { in: idsParaRemover } },
    });

    logger.info(
        { removidos: resultado.count },
        "Limpeza de tarefas e arquivos de relatórios expirados concluída.",
    );

    return resultado.count;
}