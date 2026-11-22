ALTER TABLE "lotes" ADD COLUMN "triagemConcluidaEm" TIMESTAMP(3);
ALTER TABLE "lotes" ADD COLUMN "triagemResponsavelId" UUID;
CREATE INDEX "lotes_triagemResponsavelId_idx" ON "lotes"("triagemResponsavelId");
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_triagemResponsavelId_fkey" FOREIGN KEY ("triagemResponsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "TipoRelatorioAnalitico" AS ENUM ('EFICIENCIA_OPERACIONAL', 'RENTABILIDADE_EQUIPAMENTOS', 'PREVISAO_VIDA_UTIL');

CREATE TABLE "relatorios_analiticos" (
  "id" UUID NOT NULL,
  "tipo" "TipoRelatorioAnalitico" NOT NULL,
  "organizacaoId" VARCHAR(20),
  "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "versaoModelo" VARCHAR(30) NOT NULL,
  "parametros" JSONB NOT NULL,
  "resumo" JSONB,
  CONSTRAINT "relatorios_analiticos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "relatorios_analiticos_tipo_geradoEm_idx" ON "relatorios_analiticos"("tipo", "geradoEm");
CREATE INDEX "relatorios_analiticos_organizacaoId_geradoEm_idx" ON "relatorios_analiticos"("organizacaoId", "geradoEm");
ALTER TABLE "relatorios_analiticos" ADD CONSTRAINT "relatorios_analiticos_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "resultados_eficiencia_operacional" (
  "id" UUID NOT NULL,
  "relatorioId" UUID NOT NULL,
  "operadorId" UUID,
  "nomeOperador" TEXT NOT NULL,
  "inicioPeriodo" TIMESTAMP(3) NOT NULL,
  "fimPeriodo" TIMESTAMP(3) NOT NULL,
  "unidadePeriodo" VARCHAR(15) NOT NULL,
  "quantidadeLotes" INTEGER NOT NULL,
  "tempoMedioHoras" DOUBLE PRECISION NOT NULL,
  "tempoMedianoHoras" DOUBLE PRECISION NOT NULL,
  "desvioPadraoHoras" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "resultados_eficiencia_operacional_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resultados_eficiencia_operacional_relatorioId_idx" ON "resultados_eficiencia_operacional"("relatorioId");
ALTER TABLE "resultados_eficiencia_operacional" ADD CONSTRAINT "resultados_eficiencia_operacional_relatorioId_fkey" FOREIGN KEY ("relatorioId") REFERENCES "relatorios_analiticos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resultados_eficiencia_operacional" ADD CONSTRAINT "resultados_eficiencia_operacional_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "resultados_rentabilidade_equipamento" (
  "id" UUID NOT NULL,
  "relatorioId" UUID NOT NULL,
  "tipoEquipamento" TEXT NOT NULL,
  "estadoFisico" TEXT NOT NULL,
  "marca" TEXT NOT NULL,
  "modelo" TEXT NOT NULL,
  "quantidade" INTEGER NOT NULL,
  "valorTotalRecuperacao" DECIMAL(14,2) NOT NULL,
  "valorMedioRecuperacao" DECIMAL(14,2) NOT NULL,
  "posicaoRanking" INTEGER,
  CONSTRAINT "resultados_rentabilidade_equipamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resultados_rentabilidade_equipamento_relatorioId_idx" ON "resultados_rentabilidade_equipamento"("relatorioId");
ALTER TABLE "resultados_rentabilidade_equipamento" ADD CONSTRAINT "resultados_rentabilidade_equipamento_relatorioId_fkey" FOREIGN KEY ("relatorioId") REFERENCES "relatorios_analiticos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "resultados_vida_util" (
  "id" UUID NOT NULL,
  "relatorioId" UUID NOT NULL,
  "tipoEquipamento" TEXT NOT NULL,
  "marca" TEXT NOT NULL,
  "modelo" TEXT NOT NULL,
  "amostras" INTEGER NOT NULL,
  "metodo" TEXT NOT NULL,
  "rQuadrado" DOUBLE PRECISION,
  "vidaRemanescenteMeses" DOUBLE PRECISION,
  "dataPrevistaInservivel" TIMESTAMP(3),
  CONSTRAINT "resultados_vida_util_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resultados_vida_util_relatorioId_idx" ON "resultados_vida_util"("relatorioId");
ALTER TABLE "resultados_vida_util" ADD CONSTRAINT "resultados_vida_util_relatorioId_fkey" FOREIGN KEY ("relatorioId") REFERENCES "relatorios_analiticos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "registros_recuperacao" (
  "id" UUID NOT NULL,
  "equipamentoId" UUID NOT NULL,
  "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valorRecuperacao" DECIMAL(14,2) NOT NULL,
  "observacao" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "registros_recuperacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "registros_recuperacao_equipamentoId_registradoEm_idx" ON "registros_recuperacao"("equipamentoId", "registradoEm");
ALTER TABLE "registros_recuperacao" ADD CONSTRAINT "registros_recuperacao_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "observacoes_condicao_equipamento" (
  "id" UUID NOT NULL,
  "equipamentoId" UUID NOT NULL,
  "observadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "indiceCondicao" DOUBLE PRECISION NOT NULL,
  "falhaRegistrada" BOOLEAN NOT NULL DEFAULT false,
  "observacao" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "observacoes_condicao_equipamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "observacoes_condicao_equipamento_equipamentoId_observadoEm_idx" ON "observacoes_condicao_equipamento"("equipamentoId", "observadoEm");
ALTER TABLE "observacoes_condicao_equipamento" ADD CONSTRAINT "observacoes_condicao_equipamento_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
