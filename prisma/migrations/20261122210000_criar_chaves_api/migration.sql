CREATE TYPE "PlanoChaveApi" AS ENUM ('BASICO', 'PROFISSIONAL', 'ENTERPRISE');
CREATE TYPE "StatusChaveApi" AS ENUM ('ATIVA', 'REVOGADA');

CREATE TABLE "chaves_api" (
    "id" UUID NOT NULL,
    "nomeParceiro" VARCHAR(150) NOT NULL,
    "organizacaoId" VARCHAR(20) NOT NULL,
    "prefixo" VARCHAR(8) NOT NULL,
    "hashChave" VARCHAR(64) NOT NULL,
    "escopos" TEXT[] NOT NULL,
    "plano" "PlanoChaveApi" NOT NULL DEFAULT 'BASICO',
    "limitePorMinuto" INTEGER NOT NULL DEFAULT 60,
    "status" "StatusChaveApi" NOT NULL DEFAULT 'ATIVA',
    "expiraEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" TIMESTAMP(3),
    "criadoPorId" UUID NOT NULL,
    CONSTRAINT "chaves_api_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chaves_api_prefixo_key" ON "chaves_api"("prefixo");
CREATE UNIQUE INDEX "chaves_api_hashChave_key" ON "chaves_api"("hashChave");
CREATE INDEX "chaves_api_organizacaoId_idx" ON "chaves_api"("organizacaoId");
CREATE INDEX "chaves_api_status_idx" ON "chaves_api"("status");
ALTER TABLE "chaves_api" ADD CONSTRAINT "chaves_api_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chaves_api" ADD CONSTRAINT "chaves_api_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
