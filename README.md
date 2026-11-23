# Greencode API

API REST do Greencode com Express, TypeScript, Prisma e PostgreSQL.

## Configuração

1. Copie `.env.example` para `.env` e configure `DATABASE_URL`, `SHADOW_DATABASE_URL` e `JWT_SECRET`.
2. Instale/atualize as dependências com `npm install`.
3. Aplique as migrações: `npx prisma migrate deploy --schema=prisma/schema.prisma`.
4. Gere o cliente Prisma, se necessário: `npx prisma generate --schema=prisma/schema.prisma`.
5. Crie o administrador inicial com `npm run seed:admin`.
6. Inicie a API com `npm run dev`.

## Autenticação

Envie `Authorization: Bearer <token>` nas rotas protegidas. Faça login em `POST /auth/login` com `{ "usuario": "...", "senha": "..." }`.

- `GET /auth/me`: usuário da sessão.
- `POST /auth/logout`: registra o encerramento no log de auditoria; o cliente deve descartar o token.
- `PATCH /auth/senha`: altera a senha da própria conta. Corpo: `{ "senhaAtual": "...", "senhaNova": "...", "confirmarSenha": "..." }`.

## Compatibilidade e rotas complementares implementadas

| Método | Rota | Finalidade | Perfil |
|---|---|---|---|
| `GET` | `/usuarios/buscar?usuario=...` | Busca um usuário pelo login sem retornar hash de senha | Administrador |
| `GET` | `/organizacoes/buscar?nome=...` | Pesquisa de organização por razão social | Administrador, operador de cadastro |
| `PATCH` | `/organizacoes/:id` | Edita dados cadastrais da organização | Administrador, operador de cadastro |
| `DELETE` | `/organizacoes/:id` | Exclui organização sem lotes vinculados | Administrador |
| `POST` | `/lotes/:id/triagem` | Processa a triagem e registra movimentações dos equipamentos em uma transação | Administrador, gestor de almoxarifado |
| `DELETE` | `/lotes/:id` | Exclui lote sem equipamentos vinculados | Administrador |
| `GET` | `/equipamentos?busca=...` | Pesquisa por marca, modelo ou código de barras | Administrador, gestor de almoxarifado |
| `POST` | `/equipamentos/codigo-barras` | Gera código sequencial por tipo. Corpo: `{ "tipo": "NOTEBOOK", "sequencia": 7 }` | Administrador, gestor de almoxarifado |
| `DELETE` | `/equipamentos/:id` | Exclui equipamento e movimentações associadas, mantendo registro da ação na auditoria | Administrador, gestor de almoxarifado |
| `POST` | `/equipamentos/:id/recuperacao` | Registra valor recuperado (não negativo, até duas casas decimais) e observação opcional, com auditoria | Administrador, gestor de almoxarifado |
| `GET` | `/equipamentos/:id/recuperacao` | Lista registros de recuperação em ordem decrescente de data | Administrador, gestor de almoxarifado |
| `POST` | `/equipamentos/:id/observacoes-condicao` | Registra índice de condição entre 0 e 100, falha e observação opcionais; 100 = perfeito e 0 = inservível | Administrador, gestor de almoxarifado |
| `GET` | `/equipamentos/:id/observacoes-condicao` | Lista observações de condição em ordem decrescente de data | Administrador, gestor de almoxarifado |
| `GET` | `/relatorios/organizacao?organizacaoId=BR001&inicio=2026-01-01&fim=2026-12-31` | Relatório de lotes e equipamentos por organização e período | Todos os perfis autenticados |
| `GET` | `/relatorios/status?status=AGUARDANDO_TRIAGEM` | Relatório de equipamentos por status de rastreamento | Todos os perfis autenticados |
| `GET` | `/relatorios/financeiro?inicio=2026-01-01&fim=2026-12-31` | Relatório financeiro por período | Todos os perfis autenticados |
| `GET` | `/relatorios/rastreamento/:id` | Dados e movimentações de um equipamento | Todos os perfis autenticados |
| `GET` | `/relatorios/journal?limite=100` | Consulta registros de auditoria com filtros opcionais `inicio`, `fim`, `entidade` e `acao` | Administrador, auditor |

O alias `/clientes` aponta para as mesmas rotas de `/organizacoes`, preservando o alias `cliente` do CLI. A configuração aceita atualização parcial em `PATCH /configuracao`, enviando somente `aliquotaImposto` ou somente `coeficienteDepreciacao`. A edição de equipamento também aceita `tipo`.

As exclusões de organização e lote são bloqueadas quando existem dependências que tornariam o histórico inconsistente. Equipamentos removidos têm as movimentações operacionais removidas junto, mas a ação de exclusão fica registrada na auditoria.

## Camada analítica

A camada analítica persiste cada execução em um relatório mestre (`relatorios_analiticos`) e nos resultados específicos de cada análise. Os relatórios guardam tipo, organização, data de geração, `versaoModelo`, parâmetros em JSON e resumo; as tabelas filhas guardam os resultados detalhados. Isso permite consultar o histórico e comparar execuções feitas com versões ou parâmetros diferentes.

### Análises disponíveis

- **Eficiência operacional:** mede o tempo entre a entrada do lote e `triagemConcluidaEm`, agrupando por operador e mês/trimestre. Compara o intervalo com o período anterior de mesma duração. Um grupo é gargalo quando seu tempo médio supera 1,5 vez a média geral do intervalo.
- **Rentabilidade de equipamentos:** agrega os valores de recuperação por tipo, estado físico, marca e modelo. O ranking prioriza valor médio recuperado e usa o valor total como desempate; o resumo preserva o total recuperado e `quantidadeGrupos`.
- **Previsão de vida útil:** ajusta uma regressão linear por equipamento, usando índice de condição e meses desde a primeira observação daquele equipamento. A vida remanescente do grupo é a mediana das previsões individuais e o R² do grupo é a mediana dos R² individuais. Falhas registradas e índice final igual ou inferior a zero resultam em vida remanescente zero.

### Rotas e permissões

Base: `/api/v1/internal/analytics`. Todas as rotas exigem JWT. As três operações `POST` abaixo permitem somente `ADMINISTRADOR` e `GESTOR_ALMOXARIFADO`; os GETs de histórico permitem qualquer perfil autenticado (`ADMINISTRADOR`, `OPERADOR_CADASTRO`, `GESTOR_ALMOXARIFADO` ou `AUDITOR`).

| Método | Rota | Finalidade | Perfil |
|---|---|---|---|
| `POST` | `/api/v1/internal/analytics/eficiencia-operacional` | Executar eficiência operacional. Corpo opcional: `organizacaoId`, `dataInicio`, `dataFim`, `unidadePeriodo` (`MES` ou `TRIMESTRE`). | Administrador, gestor de almoxarifado |
| `POST` | `/api/v1/internal/analytics/rentabilidade` | Executar rentabilidade. Corpo opcional: `organizacaoId`, `dataInicio`, `dataFim`. | Administrador, gestor de almoxarifado |
| `POST` | `/api/v1/internal/analytics/vida-util` | Executar previsão. Corpo opcional: `organizacaoId`, `minimoAmostras` (padrão 3). | Administrador, gestor de almoxarifado |
| `GET` | `/api/v1/internal/analytics/historico` | Listar relatórios; filtros opcionais `tipo`, `organizacaoId`, `inicio`, `fim`, `limite` (padrão 20, máximo 100). | Todos os perfis autenticados |
| `GET` | `/api/v1/internal/analytics/historico/:id` | Consultar um relatório e seus resultados pelo UUID. | Todos os perfis autenticados |

As análises usam dados alimentados pelas quatro operações de equipamento: `POST` e `GET /equipamentos/:id/recuperacao` e `POST` e `GET /equipamentos/:id/observacoes-condicao`. Essas quatro operações permitem `ADMINISTRADOR` e `GESTOR_ALMOXARIFADO`. A primeira registra/consulta valores recuperados; a segunda registra/consulta o índice de condição e `falhaRegistrada`. Também são necessários lotes com triagem concluída para a análise de eficiência.

O índice de condição é uma escala de **0 a 100**, em que **100 significa equipamento em condição perfeita** e **0 significa inservível**. Para uma previsão por regressão, o equipamento precisa ter ao menos o número configurado de observações (padrão 3) e pelo menos duas datas distintas. Equipamentos que não atendem aos requisitos são contabilizados como ignorados.

### Agendamentos

Os jobs são opcionais e iniciam junto com o servidor. Configure as variáveis abaixo com expressões aceitas pelo `node-cron`; valor vazio ou somente espaços desativa o job. Exemplo: `0 2 * * *` executa diariamente às 02:00, no fuso horário local do processo.

```dotenv
ANALYTICS_CRON_EFICIENCIA=0 2 * * *
ANALYTICS_CRON_RENTABILIDADE=0 3 * * 1
ANALYTICS_CRON_VIDA_UTIL=0 4 1 * *
```

Para alimentar o banco local com dados demonstrativos, execute `npm run seed:dados` após aplicar as migrations e definir `ADM_SENHA` (mínimo de 8 caracteres). O seed usa `upsert` com identificadores estáveis e pode ser repetido sem duplicar os registros de demonstração. Ele inclui lotes com triagem concluída, recuperações financeiras e séries de observações de condição.

## Documentação Swagger

Com a API em execução, abra no navegador:

- Interface interativa: `http://localhost:3000/api-docs`
- Documento OpenAPI em JSON: `http://localhost:3000/api-docs.json`

A interface Swagger permite expandir cada rota, visualizar e editar o exemplo JSON no campo **Request body** antes de clicar em **Execute**, além de consultar os parâmetros e a resposta. Para testar rotas protegidas, execute `POST /auth/login`, copie o token JWT retornado e clique em **Authorize** para informar o token. Os exemplos são modelos ilustrativos; ajuste IDs, enumerações e dados conforme os registros e regras do banco local. A interface carrega os arquivos visuais do Swagger UI pelo CDN do jsDelivr, portanto o navegador precisa ter acesso à internet para carregar a interface; o JSON OpenAPI é servido pela própria API.

## Popular o banco com dados de demonstração

Execute:

```bash
npm run seed:dados
```

O script é idempotente: pode ser executado novamente sem duplicar os registros de demonstração. Ele cria/atualiza usuários de teste para os quatro papéis, organizações e contratos (incluindo contrato vencido), lotes em diferentes estados e meses, com triagens atribuídas a operadores distintos, equipamentos com estados físicos e rastreamentos variados, movimentações, recuperações financeiras, séries históricas de condição, configuração e registros de auditoria.

Logins criados: `admin.seed`, `operador.seed`, `gestor.seed` e `auditor.seed`. Todos usam a senha definida em `SEED_DADOS_SENHA` ou, como alternativa, `ADM_SENHA`. Use apenas em ambiente de desenvolvimento/testes; a execução atualiza a senha desses logins de demonstração.


## Redis e processamento assíncrono de relatórios

O processamento em segundo plano usa Redis como transporte da fila BullMQ. O PostgreSQL permanece como fonte de verdade para status, progresso e metadados das tarefas. Os arquivos gerados ficam em `storage/relatorios` por padrão e não são versionados.

### Configuração no Windows 10 ou superior

1. Instale o Docker Desktop e habilite a integração com WSL2 em **Settings → Resources → WSL Integration**.
2. Abra o terminal na pasta do projeto (PowerShell, Windows Terminal ou terminal do WSL2).
3. Copie `.env.example` para `.env` e configure `DATABASE_URL`, `SHADOW_DATABASE_URL`, `JWT_SECRET` e `REDIS_URL`.
4. Instale/atualize as dependências com `npm install`.
5. Inicie o Redis com `npm run redis:up`.
6. Confira a saúde do serviço com `docker compose ps`. O Redis deve aparecer como `healthy`.
7. Aplique as migrations e gere o cliente Prisma:
   `npx prisma migrate deploy --schema=prisma/schema.prisma`
   `npx prisma generate --schema=prisma/schema.prisma`

### Configuração no Ubuntu 24.04

Com Docker Engine e o plugin Compose instalados:

1. Na pasta do projeto, copie `.env.example` para `.env` e configure as variáveis necessárias.
2. Instale/atualize as dependências com `npm install`.
3. Inicie o Redis com `npm run redis:up`.
4. Confira o serviço com `docker compose ps` e aguarde o estado `healthy`.
5. Aplique as migrations e gere o cliente Prisma:
   `npx prisma migrate deploy --schema=prisma/schema.prisma`
   `npx prisma generate --schema=prisma/schema.prisma`

Alternativamente, é possível instalar o Redis diretamente no Ubuntu com `sudo apt update && sudo apt install redis-server`, iniciar com `sudo systemctl enable --now redis-server` e ajustar `REDIS_URL` para `redis://localhost:6379`. Nesse modo, a persistência e a política de serviço ficam sob responsabilidade da instalação local, não do `docker-compose.yml`.

### Comandos do worker

- `npm run worker`: executa o worker TypeScript em desenvolvimento com `tsx`.
- `npm run worker:start`: executa a versão compilada em `dist/src/worker.js` após `npm run build`.
