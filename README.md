# GreenCode — Backend de Rastreabilidade, Analytics e API Pública

API RESTful em **Node.js**, **TypeScript**, **Express 5**, **Prisma ORM**, **PostgreSQL** e **Redis/BullMQ** para gestão de logística reversa, rastreabilidade de equipamentos, relatórios analíticos preditivos e integração externa autenticada por chave de API.

---

## Arquitetura e Módulos

- **Autenticação Interna & RBAC (`/auth`, `/usuarios`, `/organizacoes`, `/configuracao`):** controle de acesso por JWT com perfis (`ADMINISTRADOR`, `GESTOR_ALMOXARIFADO`, `OPERADOR_CADASTRO`, `AUDITOR`) e trilha de auditoria (`RegistroAuditoria`).
- **Rastreabilidade & Lotes (`/lotes`, `/equipamentos`):** gestão de lotes de entrada, geração e validação de códigos de barras de equipamentos e histórico de movimentações.
- **Analytics & Previsão de Vida Útil (`/analytics`):**
  - Eficiência operacional, rentabilidade por equipamento/modelo e previsão de vida útil remanescente via regressão linear e mediana por grupo.
  - Comparação entre previsão persistida e falha/inservibilidade realizada (`MAE` em dias).
  - Agendamento configurável em modo local (`node-cron`) ou distribuído via worker BullMQ (`ANALYTICS_AGENDADOR=worker`).
- **API Pública Versionada (`/api/v1/public`):**
  - Autenticação via cabeçalho `X-API-Key` (`gc_<prefixo>_<segredo>`) armazenada com hash SHA-256.
  - Controle granular por escopos (`batches:read`, `batches:write`, `reports:generate`, `reports:read`), isolamento estrito por organização (`404` para recursos de terceiros) e rate limiting por chave (`429`).
  - Cabeçalho `X-API-Version: 1.0.0` e suporte a cabeçalhos de depreciação (`Deprecation`, `Sunset`, `Link`).
  - Especificação OpenAPI 3.0.3 pública em `GET /api/v1/public/docs.json`.
- **Fila Assíncrona de Relatórios & Webhooks (`/api/v1/public/relatorios`):**
  - Processamento em background via **BullMQ + Redis** (`npm run worker`) com limite de tarefas simultâneas por chave e reconciliação automática de jobs órfãos.
  - Exportação incremental em `CSV` (com proteção contra CSV Injection) e `JSON`, download via streaming e expiração automática com resposta `HTTP 410 Gone`.
  - Notificação por webhook HTTPS com validação anti-SSRF (bloqueio de loopback, redes privadas e link-local) e assinatura `X-Greencode-Signature: sha256=<hmac>`.

---

## Pré-requisitos

- **Node.js** 20+
- **PostgreSQL** 15+
- **Redis** 7+ (via Docker Compose ou serviço local)

---

## Variáveis de Ambiente

Configure o arquivo `.env` na raiz do projeto:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://greencode:greencode@localhost:5432/greencode?schema=public"
TEST_DATABASE_URL="postgresql://greencode:greencode@localhost:5432/greencode_test?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="defina-um-segredo-forte-aqui"

# Relatórios assíncronos
REPORT_DIR="./storage/relatorios"
REPORT_TTL_HORAS=24
REPORT_MAX_ATIVAS_POR_CHAVE=5
REPORT_TIMEOUT_EXECUCAO_MIN=30

# Agendador Analytics ("local" ou "worker")
ANALYTICS_AGENDADOR="local"
ANALYTICS_CRON_EFICIENCIA="0 2 * * *"
ANALYTICS_CRON_RENTABILIDADE="30 2 * * *"
ANALYTICS_CRON_VIDA_UTIL="0 3 * * *"