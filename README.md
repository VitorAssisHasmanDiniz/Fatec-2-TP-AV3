# Greencode API

API RESTful do Greencode em **Node.js**, **TypeScript**, **Express 5**, **Prisma ORM**, **PostgreSQL** e **Redis/BullMQ** para gestão de logística reversa, rastreabilidade de equipamentos, relatórios analíticos preditivos e integração externa autenticada por chave de API.

## Configuração e Execução

1. Copie `.env.example` para `.env` e configure as variáveis de banco, Redis, segurança e workers:

   ```env
   PORT=3000
   NODE_ENV=development
   DATABASE_URL="postgresql://greencode:greencode@localhost:5432/greencode?schema=public"
   SHADOW_DATABASE_URL="postgresql://greencode:greencode@localhost:5432/greencode_shadow?schema=public"
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

   ```

2. Instale as dependências com `npm ci`.
3. Suba o Redis com `npm run redis:up` (ou serviço local).
4. Aplique as migrações: `npx prisma migrate deploy --schema=prisma/schema.prisma`.
5. Gere o cliente Prisma, se necessário: `npx prisma generate --schema=prisma/schema.prisma`.
6. Crie o administrador inicial com `npm run seed:admin`.
7. Inicie a aplicação em dois terminais:

* **Servidor HTTP:** `npm run dev`
* **Worker BullMQ (fila de relatórios e agendamentos):** `npm run worker`
* *(Em produção, após `npm run build`, execute `npm start` e `node dist/worker.js`.)*

## Autenticação

### API Interna (JWT & RBAC)

Envie `Authorization: Bearer <token>` nas rotas protegidas. Faça login em `POST /auth/login` com `{ "usuario": "...", "senha": "..." }`.

* `GET /auth/me`: usuário da sessão.
* `POST /auth/logout`: registra o encerramento no log de auditoria; o cliente deve descartar o token.
* `PATCH /auth/senha`: altera a senha da própria conta. Corpo: `{ "senhaAtual": "...", "senhaNova": "...", "confirmarSenha": "..." }`.

### API Pública Versionada (`/api/v1/public`)

Parceiros externos autenticam-se enviando o cabeçalho `X-API-Key: gc_<prefixo>_<segredo>` (armazenada no banco apenas via hash SHA-256).

* **Gestão Administrativa (`/api/v1/admin/chaves-api`):** emissão, listagem, rotação e revogação de chaves com trilha de auditoria (perfil `ADMINISTRADOR`).
* **Controle Granular:** validação por escopos (`batches:read`, `batches:write`, `reports:generate`, `reports:read`), isolamento estrito por organização (`404` para recursos de terceiros) e rate limiting individual por chave (`429`).
* **Versionamento:** todas as respostas públicas retornam `X-API-Version: 1.0.0` e suportam cabeçalhos de depreciação (`Deprecation`, `Sunset`, `Link`).

## Rotas Implementadas

### Rotas Internas e Operacionais

| Método | Rota | Finalidade | Perfil |
| --- | --- | --- | --- |
| `GET` | `/usuarios/buscar?usuario=...` | Busca um usuário pelo login sem retornar hash de senha | Administrador |
| `GET` | `/organizacoes/buscar?nome=...` | Pesquisa de organização por razão social | Administrador, operador de cadastro |
| `PATCH` | `/organizacoes/:id` | Edita dados cadastrais da organização | Administrador, operador de cadastro |
| `DELETE` | `/organizacoes/:id` | Exclui organização sem lotes vinculados | Administrador |
| `POST` | `/lotes/:id/triagem` | Processa a triagem e registra movimentações dos equipamentos em uma transação | Administrador, gestor de almoxarifado |
| `DELETE` | `/lotes/:id` | Exclui lote sem equipamentos vinculados | Administrador |
| `GET` | `/equipamentos?busca=...` | Pesquisa por marca, modelo ou código de barras | Administrador, gestor de almoxarifado |
| `POST` | `/equipamentos/codigo-barras` | Gera código sequencial por tipo. Corpo: `{ "tipo": "NOTEBOOK", "sequencia": 7 }` | Administrador, gestor de almoxarifado |
| `DELETE` | `/equipamentos/:id` | Exclui equipamento e movimentações associadas, mantendo registro da ação na auditoria | Administrador, gestor de almoxarifado |
| `GET` | `/relatorios/organizacao?organizacaoId=BR001&inicio=2026-01-01&fim=2026-12-31` | Relatório de lotes e equipamentos por organização e período | Todos os perfis autenticados |
| `GET` | `/relatorios/status?status=AGUARDANDO_TRIAGEM` | Relatório de equipamentos por status de rastreamento | Todos os perfis autenticados |
| `GET` | `/relatorios/financeiro?inicio=2026-01-01&fim=2026-12-31` | Relatório financeiro por período | Todos os perfis autenticados |
| `GET` | `/relatorios/rastreamento/:id` | Dados e movimentações de um equipamento | Todos os perfis autenticados |
| `GET` | `/relatorios/journal?limite=100` | Consulta registros de auditoria com filtros opcionais `inicio`, `fim`, `entidade` e `acao` | Administrador, auditor |

O alias `/clientes` aponta para as mesmas rotas de `/organizacoes`, preservando o alias `cliente` do CLI. A configuração aceita atualização parcial em `PATCH /configuracao`, enviando somente `aliquotaImposto` ou somente `coeficienteDepreciacao`. A edição de equipamento também aceita `tipo`.

As exclusões de organização e lote são bloqueadas quando existem dependências que tornariam o histórico inconsistente. Equipamentos removidos têm as movimentações operacionais removidas junto, mas a ação de exclusão fica registrada na auditoria.

### Rotas da API Pública (`/api/v1/public`)

| Método | Rota | Finalidade | Escopo |
| --- | --- | --- | --- |
| `GET` | `/api/v1/public/docs.json` | Especificação OpenAPI 3.0.3 pública (sem autenticação) | Público |
| `GET` | `/api/v1/public/rastreabilidade/equipamentos/:codigoBarras` | Consulta histórico e movimentações de um equipamento | `batches:read` |
| `GET` | `/api/v1/public/lotes` | Lista lotes da organização vinculada à chave | `batches:read` |
| `POST` | `/api/v1/public/lotes` | Cria um novo lote para a organização | `batches:write` |
| `GET` | `/api/v1/public/lotes/:id` | Consulta detalhes de um lote da organização | `batches:read` |
| `POST` | `/api/v1/public/relatorios` | Enfileira geração assíncrona de relatório (`CSV` ou `JSON`) | `reports:generate` |
| `GET` | `/api/v1/public/relatorios/:id` | Consulta status da tarefa (`NA_FILA`, `EM_EXECUCAO`, `CONCLUIDA`, `FALHOU`) | `reports:read` |
| `GET` | `/api/v1/public/relatorios/:id/download` | Download streaming do arquivo gerado (`410` se expirado) | `reports:read` |

## Analytics, Fila Assíncrona e Webhooks

* **Analytics & Previsão de Vida Útil (`/analytics`):** calcula indicadores de eficiência operacional, rentabilidade por modelo/equipamento e previsão de vida útil remanescente via regressão linear e mediana por grupo, além de comparar previsões anteriores com falhas realizadas (`MAE` em dias). Suporta agendamento local (`node-cron`) ou distribuído via BullMQ (`ANALYTICS_AGENDADOR=worker`).
* **Fila BullMQ & Exportação:** o worker (`npm run worker`) processa relatórios de forma incremental em `CSV` (com neutralização contra CSV Injection) e `JSON`, impõe limite de tarefas ativas por chave (`REPORT_MAX_ATIVAS_POR_CHAVE`), reconcilia jobs órfãos e expira arquivos após `REPORT_TTL_HORAS`.
* **Webhooks Seguros:** ao informar `webhookUrl` HTTPS na solicitação de relatório, o worker valida o destino contra SSRF (bloqueando loopback, redes privadas e link-local) e envia o evento assinado com `X-Greencode-Signature: sha256=<hmac>`.

## Documentação Swagger e OpenAPI

Com a API em execução, acesse:

* **Interface interativa (API interna):** `http://localhost:3000/api-docs`
* **Documento OpenAPI JSON (API interna):** `http://localhost:3000/api-docs.json`
* **Documento OpenAPI JSON (API pública v1):** `http://localhost:3000/api/v1/public/docs.json`

A interface Swagger permite expandir cada rota, visualizar e editar o exemplo JSON no campo **Request body** antes de clicar em **Execute**, além de consultar os parâmetros e a resposta. Para testar rotas protegidas internas, execute `POST /auth/login`, copie o token JWT retornado e clique em **Authorize** para informar o token. Os exemplos são modelos ilustrativos; ajuste IDs, enumerações e dados conforme os registros e regras do banco local. A interface carrega os arquivos visuais do Swagger UI pelo CDN do jsDelivr, portanto o navegador precisa ter acesso à internet para carregar a interface; os arquivos JSON OpenAPI são servidos pela própria API.

## Popular o Banco com Dados de Demonstração

Execute:

```bash
npm run seed:dados

```

O script é idempotente: pode ser executado novamente sem duplicar os registros de demonstração. Ele cria/atualiza usuários de teste para os quatro papéis, organizações e contratos (incluindo contrato vencido), lotes em diferentes estados, equipamentos com estados físicos e rastreamentos variados, movimentações, configuração e registros de auditoria.

Logins criados: `admin.seed`, `operador.seed`, `gestor.seed` e `auditor.seed`. Todos usam a senha definida em `SEED_DADOS_SENHA` ou, como alternativa, `ADM_SENHA`. Use apenas em ambiente de desenvolvimento/testes; a execução atualiza a senha desses logins de demonstração.

## Testes Automatizados

```bash
# Verificação de tipos e build
npm run typecheck
npm run typecheck:tests
npm run build

# Suíte completa (unitários + integração com PostgreSQL e Redis)
TEST_DATABASE_URL="postgresql://greencode:greencode@localhost:5432/greencode_test?schema=public" \
REDIS_URL="redis://localhost:6379" \
npm test

```
