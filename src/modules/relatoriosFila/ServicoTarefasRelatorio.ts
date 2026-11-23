import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { prisma } from "../../lib/prisma.js";
import AppError from "../../errors/AppError.js";
import type { Prisma, StatusTarefaRelatorio } from "../../../generated/prisma/client.js";
import type { ContextoChaveApi } from "../apiPublica/middlewareChaveApi.js";
import { adicionarTarefaNaFila } from "./fila.js";
import {
    montarNomeDownloadRelatorio,
    resolverCaminhoSeguroRelatorio,
} from "./segurancaCaminho.js";
import type {
    EntradaCriarTarefaRelatorio,
    FiltrosListarTarefasRelatorio,
} from "./validacoes.js";

const STATUS_ATIVOS: StatusTarefaRelatorio[] = ["NA_FILA", "EM_EXECUCAO"];

function obterLimiteTarefasAtivas(): number {
    const valor = Number(process.env.REPORT_MAX_ATIVAS_POR_CHAVE ?? 3);
    if (!Number.isFinite(valor) || valor < 1) {
        return 3;
    }
    return Math.floor(valor);
}

export interface ResumoTarefaPublica {
    id: string;
    tipo: string;
    formato: string;
    status: string;
    progresso: number;
    relatorioAnaliticoId: string | null;
    tamanhoBytes: number | null;
    erro: string | null;
    tentativas: number;
    criadoEm: Date;
    iniciadoEm: Date | null;
    concluidoEm: Date | null;
    expiraEm: Date | null;
}

interface RegistroTarefaSelecionado {
    id: string;
    tipo: string;
    formato: "CSV" | "JSON";
    status: StatusTarefaRelatorio;
    progresso: number;
    relatorioAnaliticoId: string | null;
    tamanhoBytes: bigint | null;
    erro: string | null;
    tentativas: number;
    criadoEm: Date;
    iniciadoEm: Date | null;
    concluidoEm: Date | null;
    expiraEm: Date | null;
}

function formatarTarefaPublica(tarefa: RegistroTarefaSelecionado): ResumoTarefaPublica {
    return {
        id: tarefa.id,
        tipo: tarefa.tipo,
        formato: tarefa.formato,
        status: tarefa.status,
        progresso: tarefa.progresso,
        relatorioAnaliticoId: tarefa.relatorioAnaliticoId,
        tamanhoBytes: tarefa.tamanhoBytes !== null ? Number(tarefa.tamanhoBytes) : null,
        erro: tarefa.erro,
        tentativas: tarefa.tentativas,
        criadoEm: tarefa.criadoEm,
        iniciadoEm: tarefa.iniciadoEm,
        concluidoEm: tarefa.concluidoEm,
        expiraEm: tarefa.expiraEm,
    };
}

export class ServicoTarefasRelatorio {
    async criarTarefa(
        entrada: EntradaCriarTarefaRelatorio,
        contexto: ContextoChaveApi,
    ): Promise<{ tarefaId: string; statusUrl: string }> {
        const limiteAtivas = obterLimiteTarefasAtivas();

        const ativasAtuais = await prisma.tarefaRelatorio.count({
            where: {
                chaveApiId: contexto.chaveId,
                status: { in: STATUS_ATIVOS },
            },
        });

        if (ativasAtuais >= limiteAtivas) {
            throw new AppError(
                `Limite de ${limiteAtivas} tarefas de relatório ativas simultaneamente atingido para esta chave API.`,
                429,
                "LIMITE_TAREFAS_ATIVAS",
            );
        }

        const parametrosPersistidos = {
            ...entrada.parametros,
            organizacaoId: contexto.organizacaoId,
        } as Prisma.InputJsonObject;

        const tarefa = await prisma.tarefaRelatorio.create({
            data: {
                organizacaoId: contexto.organizacaoId,
                chaveApiId: contexto.chaveId,
                tipo: entrada.tipo,
                parametros: parametrosPersistidos,
                formato: entrada.formato,
                status: "NA_FILA",
                progresso: 0,
            },
            select: { id: true },
        });

        try {
            await adicionarTarefaNaFila(tarefa.id);
        } catch (erro) {
            await prisma.tarefaRelatorio.update({
                where: { id: tarefa.id },
                data: {
                    status: "FALHOU",
                    erro: "Falha ao enfileirar tarefa para processamento assíncrono.",
                    concluidoEm: new Date(),
                },
            }).catch(() => undefined);

            throw erro;
        }

        return {
            tarefaId: tarefa.id,
            statusUrl: `/api/v1/public/relatorios/${tarefa.id}`,
        };
    }

    async listarTarefas(
        filtros: FiltrosListarTarefasRelatorio,
        contexto: ContextoChaveApi,
    ): Promise<{
        tarefas: ResumoTarefaPublica[];
        pagina: number;
        limite: number;
        total: number;
        totalPaginas: number;
    }> {
        const where = {
            chaveApiId: contexto.chaveId,
            organizacaoId: contexto.organizacaoId,
        };

        const [registros, total] = await Promise.all([
            prisma.tarefaRelatorio.findMany({
                where,
                select: {
                    id: true,
                    tipo: true,
                    formato: true,
                    status: true,
                    progresso: true,
                    relatorioAnaliticoId: true,
                    tamanhoBytes: true,
                    erro: true,
                    tentativas: true,
                    criadoEm: true,
                    iniciadoEm: true,
                    concluidoEm: true,
                    expiraEm: true,
                },
                orderBy: { criadoEm: "desc" },
                skip: (filtros.pagina - 1) * filtros.limite,
                take: filtros.limite,
            }),
            prisma.tarefaRelatorio.count({ where }),
        ]);

        return {
            tarefas: registros.map(formatarTarefaPublica),
            pagina: filtros.pagina,
            limite: filtros.limite,
            total,
            totalPaginas: Math.ceil(total / filtros.limite),
        };
    }

    async obterTarefaPorId(
        id: string,
        contexto: ContextoChaveApi,
    ): Promise<ResumoTarefaPublica> {
        const tarefa = await prisma.tarefaRelatorio.findFirst({
            where: {
                id,
                chaveApiId: contexto.chaveId,
                organizacaoId: contexto.organizacaoId,
            },
            select: {
                id: true,
                tipo: true,
                formato: true,
                status: true,
                progresso: true,
                relatorioAnaliticoId: true,
                tamanhoBytes: true,
                erro: true,
                tentativas: true,
                criadoEm: true,
                iniciadoEm: true,
                concluidoEm: true,
                expiraEm: true,
            },
        });

        if (!tarefa) {
            throw new AppError("Tarefa de relatório não encontrada.", 404, "TAREFA_NAO_ENCONTRADA");
        }

        return formatarTarefaPublica(tarefa);
    }

    async prepararDownload(
        id: string,
        contexto: ContextoChaveApi,
    ): Promise<{ caminhoArquivo: string; nomeDownload: string }> {
        const tarefa = await prisma.tarefaRelatorio.findFirst({
            where: {
                id,
                chaveApiId: contexto.chaveId,
                organizacaoId: contexto.organizacaoId,
            },
            select: {
                id: true,
                formato: true,
                status: true,
                caminhoArquivo: true,
                expiraEm: true,
            },
        });

        if (!tarefa) {
            throw new AppError("Tarefa de relatório não encontrada.", 404, "TAREFA_NAO_ENCONTRADA");
        }

        if (tarefa.status !== "CONCLUIDA") {
            throw new AppError(
                "O relatório ainda não está pronto para download.",
                409,
                "RELATORIO_NAO_PRONTO",
            );
        }

        if (tarefa.expiraEm && tarefa.expiraEm <= new Date()) {
            throw new AppError(
                "O arquivo deste relatório expirou e não está mais disponível.",
                410,
                "RELATORIO_EXPIRADO",
            );
        }

        if (!tarefa.caminhoArquivo) {
            throw new AppError(
                "O arquivo deste relatório não está mais disponível.",
                410,
                "RELATORIO_EXPIRADO",
            );
        }

        let caminhoSeguro: string;
        try {
            caminhoSeguro = resolverCaminhoSeguroRelatorio(tarefa.caminhoArquivo);
        } catch {
            throw new AppError(
                "Caminho do arquivo de relatório inválido.",
                500,
                "CAMINHO_ARQUIVO_INVALIDO",
            );
        }

        try {
            await access(caminhoSeguro, fsConstants.R_OK);
        } catch {
            throw new AppError(
                "O arquivo deste relatório expirou ou foi removido do armazenamento.",
                410,
                "RELATORIO_EXPIRADO",
            );
        }

        const nomeDownload = montarNomeDownloadRelatorio(tarefa.id, tarefa.formato);

        return {
            caminhoArquivo: caminhoSeguro,
            nomeDownload,
        };
    }
}