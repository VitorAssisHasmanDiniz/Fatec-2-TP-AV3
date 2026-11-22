ALTER TABLE "resultados_vida_util"
ADD COLUMN "equipamentosAnalisados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "taxaFalhas" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "motivoIndisponivel" TEXT,
ADD COLUMN "previsaoDisponivel" BOOLEAN NOT NULL DEFAULT false;
