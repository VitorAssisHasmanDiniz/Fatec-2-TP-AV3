# Relatório arquitetural — Pilar analítico

## Objetivo

A camada analítica concentra cálculos de eficiência operacional, rentabilidade de equipamentos e previsão de vida útil sem acoplar regras estatísticas às rotas HTTP. Os serviços consultam os dados do domínio, calculam indicadores e persistem cada execução para permitir comparação histórica entre versões e parâmetros.

## Decisões arquiteturais

- **Separação por responsabilidade:** cada análise possui serviço próprio; os cálculos estatísticos reutilizáveis ficam em `calculosEstatisticos.ts`.
- **Estatística especializada:** `simple-statistics` fornece média, mediana, desvio padrão, regressão linear e R², evitando implementar fórmulas matemáticas manualmente.
- **Persistência histórica:** cada execução gera um relatório com parâmetros e versão do modelo, além dos resultados específicos da análise.
- **Isolamento da API:** o módulo expõe contratos e funções de serviço, enquanto rotas e agendamentos são adaptadores de entrada independentes.
- **Testabilidade:** cálculos puros recebem valores explícitos e não acessam Prisma, permitindo testes determinísticos com `node:test`.
- **Previsões cautelosas:** a regressão exige amostras suficientes e não deve ser interpretada como garantia; R² e quantidade de observações acompanham a projeção.

## Limitações e premissas

A qualidade dos resultados depende da completude dos registros operacionais, financeiros e históricos. Uma previsão de vida útil só é útil quando existem observações temporais representativas. O controle de concorrência do agendador em memória protege uma única instância do processo; ambientes com múltiplas instâncias precisam de coordenação distribuída.

## Validação

Os testes unitários cobrem estatísticas descritivas, regressão linear, R² e entradas inválidas. A validação integrada ainda deve executar a suíte e a compilação no ambiente do projeto, com o Prisma Client gerado a partir do schema aplicado.
