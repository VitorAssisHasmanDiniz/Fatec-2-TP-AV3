CREATE TYPE "FormatoTarefaRelatorio" AS ENUM ('CSV', 'JSON');
CREATE TYPE "StatusTarefaRelatorio" AS ENUM ('NA_FILA', 'EM_EXECUCAO', 'CONCLUIDA', 'FALHOU');

CREATE TABLE "tarefas_relatorios" (
    "id" UUID NOT NULL,
    "organizacaoId" VARCHAR(20) NOT NULL,
    "chaveApiId" UUID NOT NULL,
    "tipo" "TipoRelatorioAnalitico" NOT NULL,
    "parametros" JSONB NOT NULL,
    "formato" "FormatoTarefaRelatorio" NOT NULL,
    "status" "StatusTarefaRelatorio" NOT NULL DEFAULT 'NA_FILA',
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "relatorioAnaliticoId" UUID,
    "caminhoArquivo" TEXT,
    "tamanhoBytes" BIGINT,
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3),
    CONSTRAINT "tarefas_relatorios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tarefas_relatorios_progresso_check" CHECK ("progresso" >= 0 AND "progresso" <= 100),
    CONSTRAINT "tarefas_relatorios_tentativas_check" CHECK ("tentativas" >= 0)
);

CREATE INDEX "tarefas_relatorios_chaveApiId_criadoEm_idx"
    ON "tarefas_relatorios"("chaveApiId", "criadoEm");
CREATE INDEX "tarefas_relatorios_organizacaoId_criadoEm_idx"
    ON "tarefas_relatorios"("organizacaoId", "criadoEm");
CREATE INDEX "tarefas_relatorios_status_criadoEm_idx"
    ON "tarefas_relatorios"("status", "criadoEm");
CREATE INDEX "tarefas_relatorios_expiraEm_idx"
    ON "tarefas_relatorios"("expiraEm");

ALTER TABLE "tarefas_relatorios"
    ADD CONSTRAINT "tarefas_relatorios_organizacaoId_fkey"
    FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarefas_relatorios"
    ADD CONSTRAINT "tarefas_relatorios_chaveApiId_fkey"
    FOREIGN KEY ("chaveApiId") REFERENCES "chaves_api"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarefas_relatorios"
    ADD CONSTRAINT "tarefas_relatorios_relatorioAnaliticoId_fkey"
    FOREIGN KEY ("relatorioAnaliticoId") REFERENCES "relatorios_analiticos"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
