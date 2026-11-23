# Relatório arquitetural — Pilar 2: API pública

## Escopo e arquitetura

A API de parceiros é isolada das rotas internas e publicada sob `/api/v1/public`. A administração de chaves fica em `/api/v1/admin/chaves-api`, protegida pela autenticação JWT existente e pelo papel `ADMINISTRADOR`. A documentação pública é servida separadamente em `/api/v1/public/docs` e `/api/v1/public/docs.json`; a documentação interna permanece em `/api-docs` e `/api-docs.json`.

As chaves seguem o formato `gc_<prefixo>_<segredo>`. O segredo é gerado com `crypto.randomBytes`; o banco armazena somente o SHA-256. A comparação de hashes utiliza `crypto.timingSafeEqual`, após validar os comprimentos. A chave completa deve ser exibida apenas na criação ou rotação. O middleware verifica formato, existência, status, expiração e escopo, e disponibiliza o contexto da chave à rota. O registro de último uso é atualizado de forma assíncrona, com intervalo mínimo pretendido de um minuto.

## Autorização, isolamento e limites

Os escopos são `tracking:read`, `batches:read`, `batches:write`, `reports:read` e `reports:generate`. As consultas de lotes e equipamentos restringem a organização pelo `organizacaoId` associado à chave. Recursos fora dessa organização devem ser tratados como inexistentes (404), evitando revelar sua existência. A criação de lote ignora a organização enviada pelo parceiro e utiliza a organização do contexto autenticado.

O limitador de tráfego usa o identificador da chave como chave de contagem, o limite configurado no registro e os cabeçalhos padrão. Um limitador separado por IP atua somente nas tentativas com chave inválida. Respostas de recursos públicos incluem `X-API-Version: 1`. O helper `marcarDepreciacao(dataSunset)` permite preparar avisos futuros com os cabeçalhos `Deprecation` e `Sunset`.

## Testes e limitações verificadas

A suíte adicionada em `tests/apiPublica.test.ts` cobre geração e formato, hash, chave ausente/inválida, documentação isolada, cabeçalho de versão e resposta 429 do limitador com limite baixo. Os testes de ciclo de vida persistido (criação, revogação e rotação), escopo insuficiente e isolamento entre organizações dependem de fixtures e de um PostgreSQL descartável; não devem ser executados contra o banco de desenvolvimento ou produção. Eles permanecem pendentes até a configuração de `TEST_DATABASE_URL` e das fixtures correspondentes.

A validação de build, geração do cliente Prisma e execução integral da suíte deve ser registrada com o resultado real no ambiente que tenha dependências instaladas, cliente gerado e banco de teste disponível. A existência deste relatório não significa que esses testes de integração tenham sido aprovados.

## Evolução para centenas ou milhares de parceiros

- **Cache de validação:** manter cache de curta duração para o vínculo prefixo/hash/status/escopos, invalidado imediatamente em revogação e rotação. Nunca armazenar a chave em texto puro.
- **Redis:** compartilhar contadores de rate limit entre instâncias da API e aplicar limites distribuídos por chave, com TTL alinhado à janela. O limitador em memória é adequado apenas a uma única instância.
- **Planos comerciais:** centralizar cotas por plano (BASICO, PROFISSIONAL e ENTERPRISE), limites por minuto, limites diários e políticas de burst; persistir exceções por parceiro.
- **Observabilidade:** métricas por chave e rota sem registrar o segredo, alertas de 401/403/429, latência, disponibilidade e trilha de auditoria para alterações administrativas.
- **Escala de leitura:** considerar cache de respostas públicas com chave composta por organização, recurso e filtros; invalidar o cache em alterações de lotes/equipamentos. Aplicar paginação e limites máximos em todas as listagens.
