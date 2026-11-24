-- Adiciona o estado EXPIRADA para tarefas cujo arquivo já expirou, preservando o registro para HTTP 410
ALTER TYPE "StatusTarefaRelatorio" ADD VALUE IF NOT EXISTS 'EXPIRADA';

-- Adiciona segredo HMAC na chave API (exibido uma única vez na criação/rotação)
ALTER TABLE "chaves_api"
    ADD COLUMN "segredoWebhookHash" VARCHAR(64);

-- Adiciona URL opcional de webhook na tarefa de relatório
ALTER TABLE "tarefas_relatorios"
    ADD COLUMN "webhookUrl" TEXT;
