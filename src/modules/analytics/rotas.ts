import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../../../generated/prisma/client.js";
import AppError from "../../errors/AppError.js";
import autenticar from "../../middlewares/autenticar.js";
import autorizar from "../../middlewares/autorizar.js";
import {
    executarAnaliseEficienciaOperacional,
    executarAnaliseRentabilidadeEquipamentos,
    executarPrevisaoVidaUtil,
    obterHistoricoRelatorios,
    obterRelatorioPorId,
} from "./index.js";
import {
    eficienciaOperacionalSchema,
    historicoSchema,
    idRelatorioSchema,
    previsaoVidaUtilSchema,
    rentabilidadeSchema,
} from "./validacoes.js";

export const analyticsRouter = Router();

analyticsRouter.use(autenticar);

async function executarComTratamentoOrganizacao<T>(
    organizacaoId: string | undefined,
    executar: () => Promise<T>,
): Promise<T> {
    try {
        return await executar();
    } catch (erro) {
        if (
            organizacaoId &&
            erro instanceof Prisma.PrismaClientKnownRequestError &&
            erro.code === "P2003"
        ) {
            throw new AppError(
                "Organização não encontrada.",
                404,
                "ORGANIZACAO_NAO_ENCONTRADA",
            );
        }

        throw erro;
    }
}

function validar<T extends z.ZodType>(
    esquema: T,
    dados: unknown,
): z.infer<T> {
    const resultado = esquema.safeParse(dados);

    if (!resultado.success) {
        throw new AppError(
            resultado.error.issues
                .map((erro) => `${erro.path.join(".")}: ${erro.message}`)
                .join("; "),
            400,
            "DADOS_INVALIDOS",
        );
    }

    return resultado.data;
}

analyticsRouter.post(
    "/eficiencia-operacional",
    autorizar("ADMINISTRADOR", "GESTOR_ALMOXARIFADO"),
    async (req, res) => {
        const parametros = validar(eficienciaOperacionalSchema, req.body);
        const dados = await executarComTratamentoOrganizacao(
            parametros.organizacaoId,
            () => executarAnaliseEficienciaOperacional(parametros),
        );

        res.status(201).json({
            nivel: "SUCESSO",
            mensagem: "Análise de eficiência operacional concluída.",
            dados,
        });
    },
);

analyticsRouter.post(
    "/rentabilidade",
    autorizar("ADMINISTRADOR", "GESTOR_ALMOXARIFADO"),
    async (req, res) => {
        const parametros = validar(rentabilidadeSchema, req.body);
        const dados = await executarComTratamentoOrganizacao(
            parametros.organizacaoId,
            () => executarAnaliseRentabilidadeEquipamentos(parametros),
        );

        res.status(201).json({
            nivel: "SUCESSO",
            mensagem: "Análise de rentabilidade concluída.",
            dados,
        });
    },
);

analyticsRouter.post(
    "/vida-util",
    autorizar("ADMINISTRADOR", "GESTOR_ALMOXARIFADO"),
    async (req, res) => {
        const parametros = validar(previsaoVidaUtilSchema, req.body);
        const dados = await executarComTratamentoOrganizacao(
            parametros.organizacaoId,
            () => executarPrevisaoVidaUtil(parametros),
        );

        res.status(201).json({
            nivel: "SUCESSO",
            mensagem: "Previsão de vida útil concluída.",
            dados,
        });
    },
);

analyticsRouter.get("/historico", async (req, res) => {
    const filtros = validar(historicoSchema, req.query);
    const relatorios = await obterHistoricoRelatorios({
        tipo: filtros.tipo,
        organizacaoId: filtros.organizacaoId,
        inicio: filtros.inicio,
        fim: filtros.fim,
        limite: filtros.limite,
    });

    res.json({
        nivel: "SUCESSO",
        mensagem: "Histórico analítico consultado.",
        dados: relatorios,
    });
});

analyticsRouter.get("/historico/:id", async (req, res) => {
    const { id } = validar(idRelatorioSchema, req.params);
    const relatorio = await obterRelatorioPorId(id);

    if (!relatorio) {
        throw new AppError(
            "Relatório analítico não encontrado.",
            404,
            "RELATORIO_NAO_ENCONTRADO",
        );
    }

    res.json({
        nivel: "SUCESSO",
        mensagem: "Relatório analítico consultado.",
        dados: relatorio,
    });
});
