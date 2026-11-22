-- Stage 1: analytics schema and domain-source history additions.
ALTER TABLE "lotes" ADD COLUMN "triagemConcluidaEm" TIMESTAMP(3), ADD COLUMN "triagemResponsavelId" UUID;
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_triagemResponsavelId_fkey" FOREIGN KEY ("triagemResponsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "AnalyticsReportType" AS ENUM ('EFICIENCIA_OPERACIONAL', 'RENTABILIDADE_EQUIPAMENTO', 'VIDA_UTIL_REMANESCENTE');

CREATE TABLE "analytics_reports" (
  "id" UUID NOT NULL, "type" "AnalyticsReportType" NOT NULL, "organizationId" VARCHAR(20),
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "modelVersion" VARCHAR(30) NOT NULL,
  "parameters" JSONB NOT NULL, "summary" JSONB, CONSTRAINT "analytics_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "analytics_reports_type_generatedAt_idx" ON "analytics_reports"("type", "generatedAt");
CREATE INDEX "analytics_reports_organizationId_generatedAt_idx" ON "analytics_reports"("organizationId", "generatedAt");

CREATE TABLE "analytics_operational_results" (
  "id" UUID NOT NULL, "reportId" UUID NOT NULL, "operatorId" UUID, "operatorName" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL, "lotesConcluidos" INTEGER NOT NULL,
  "tempoMedioHoras" DOUBLE PRECISION, "tempoMedianoHoras" DOUBLE PRECISION, "desvioPadraoHoras" DOUBLE PRECISION,
  "detalhes" JSONB, CONSTRAINT "analytics_operational_results_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "analytics_operational_results_reportId_periodStart_idx" ON "analytics_operational_results"("reportId", "periodStart");
ALTER TABLE "analytics_operational_results" ADD CONSTRAINT "analytics_operational_results_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "analytics_profitability_results" (
  "id" UUID NOT NULL, "reportId" UUID NOT NULL, "tipo" "TipoEquipamento" NOT NULL, "estadoFisico" "EstadoFisico" NOT NULL,
  "marca" TEXT NOT NULL, "modelo" TEXT NOT NULL, "quantidade" INTEGER NOT NULL,
  "valorTotal" DECIMAL(14,2) NOT NULL, "valorMedio" DECIMAL(14,2) NOT NULL, "ranking" INTEGER,
  CONSTRAINT "analytics_profitability_results_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "analytics_profitability_results_reportId_ranking_idx" ON "analytics_profitability_results"("reportId", "ranking");
ALTER TABLE "analytics_profitability_results" ADD CONSTRAINT "analytics_profitability_results_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "analytics_remaining_life_results" (
  "id" UUID NOT NULL, "reportId" UUID NOT NULL, "tipo" "TipoEquipamento" NOT NULL, "marca" TEXT NOT NULL, "modelo" TEXT NOT NULL,
  "idadeAtualAnos" DOUBLE PRECISION, "vidaRemanescenteAnos" DOUBLE PRECISION, "dataPrevistaInservivel" TIMESTAMP(3),
  "rSquared" DOUBLE PRECISION, "amostras" INTEGER NOT NULL, "metodo" VARCHAR(40) NOT NULL, "detalhes" JSONB,
  CONSTRAINT "analytics_remaining_life_results_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "analytics_remaining_life_results_reportId_idx" ON "analytics_remaining_life_results"("reportId");
ALTER TABLE "analytics_remaining_life_results" ADD CONSTRAINT "analytics_remaining_life_results_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "analytics_recovery_records" (
  "id" UUID NOT NULL, "equipamentoId" UUID NOT NULL, "valorRecuperado" DECIMAL(14,2) NOT NULL, "moeda" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "recuperadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "descricao" TEXT, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_recovery_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "analytics_recovery_records_equipamentoId_recuperadoEm_idx" ON "analytics_recovery_records"("equipamentoId", "recuperadoEm");
ALTER TABLE "analytics_recovery_records" ADD CONSTRAINT "analytics_recovery_records_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "analytics_condition_observations" (
  "id" UUID NOT NULL, "equipamentoId" UUID NOT NULL, "observadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "indicadorCondicao" DOUBLE PRECISION NOT NULL,
  "percentualDepreciacao" DOUBLE PRECISION, "falhaRegistrada" BOOLEAN NOT NULL DEFAULT false, "descricao" TEXT,
  CONSTRAINT "analytics_condition_observations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "analytics_condition_observations_equipamentoId_observadoEm_idx" ON "analytics_condition_observations"("equipamentoId", "observadoEm");
ALTER TABLE "analytics_condition_observations" ADD CONSTRAINT "analytics_condition_observations_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
