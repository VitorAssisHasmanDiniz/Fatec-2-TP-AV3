# Relatório técnico — Camada analítica (Pilar 1)

## Objetivo e decisões

O módulo separa consultas, cálculos puros, serviços de análise, rotas HTTP e agendamento. As três análises são eficiência operacional, rentabilidade de equipamentos e previsão de vida útil. Os cálculos estatísticos usam `simple-statistics` para média, mediana, desvio padrão, regressão linear e coeficiente de determinação (R²). A biblioteca reduz a manutenção de fórmulas próprias e oferece funções focadas; ainda assim, validações de amostra e casos degenerados permanecem responsabilidade do módulo.

## Persistência e rastreabilidade

Cada execução cria um registro mestre em `relatorios_analiticos`, contendo tipo, organização opcional, instante de geração, `versaoModelo`, `parametros` em JSON e resumo. Os detalhes ficam em tabelas próprias: `resultados_eficiencia_operacional`, `resultados_rentabilidade_equipamento` e `resultados_vida_util`. A separação mantém consultas históricas por tipo e permite alterar o formato dos resultados sem transformar o registro mestre em uma tabela larga. `versaoModelo` e os parâmetros efetivamente usados devem ser preservados para interpretar resultados antigos.

A comparação entre previsão e realidade deve usar o instante e a versão da previsão persistida como baseline. Quando o equipamento receber novas observações ou for marcado como inservível/baixado, compare a data real com `dataPrevistaInservivel` e calcule erro absoluto em meses; em conjuntos de previsões, acompanhe MAE e RMSE por versão e grupo. **O backtest automatizado e a atualização do resultado previsto com a data real ainda não estão implementados**: atualmente há persistência suficiente para construir essa avaliação, mas ela exige uma rotina analítica adicional e uma definição operacional consistente de “inservível”.

## Métodos e limites

**Eficiência.** O tempo de processamento é calculado entre a entrada do lote e `triagemConcluidaEm`; lotes cancelados são excluídos. O período anterior tem exatamente a mesma duração do intervalo atual e termina no início deste. Um grupo é marcado como gargalo quando sua média supera `1,5 × média geral` do intervalo. Esse limiar é uma regra operacional configurada no código, não uma inferência estatística nem um SLA aprendido.

**Rentabilidade.** Os registros de recuperação são agrupados por tipo, estado físico, marca e modelo. O ranking ordena pela recuperação média decrescente e usa a recuperação total como desempate; o resumo conserva o total financeiro e a quantidade de grupos.

**Vida útil.** A regressão é ajustada separadamente para cada equipamento: eixo X = meses desde sua primeira observação; eixo Y = índice de condição na escala de 0 a 100 (100 = perfeito; 0 = inservível). São exigidas pelo menos três observações por padrão (configurável) e duas datas distintas. Equipamentos que não atendem aos requisitos são ignorados. Inclinação não negativa não gera cruzamento projetado; falha na última observação ou índice final ≤ 0 gera vida remanescente zero. Para cada grupo (tipo, marca, modelo), a vida remanescente e o R² são consolidados pela mediana dos equipamentos com previsão; a taxa de falhas é a proporção de equipamentos do grupo com alguma falha registrada.

A previsão é uma extrapolação linear, não uma avaliação de engenharia. Ela pressupõe tendência aproximadamente estável, depende da frequência e qualidade das observações e não incorpora carga de trabalho, ambiente, manutenção, fabricante ou mudanças de uso. O R² mede ajuste aos pontos observados, não a probabilidade de a previsão se concretizar. Poucas amostras, histórico curto, observações concentradas ou mudanças bruscas podem produzir projeções frágeis. O baseline opcional por depreciação não foi implementado.

## Agendamento, falhas e escala

Os jobs são ativados pelas variáveis `ANALYTICS_CRON_EFICIENCIA`, `ANALYTICS_CRON_RENTABILIDADE` e `ANALYTICS_CRON_VIDA_UTIL`; valor vazio desativa cada tarefa. Falhas são registradas no log e o processo segue; **não há retry, fila persistente nem dead-letter queue**. O bloqueio de concorrência usa `Set` em memória e protege somente a instância atual. Em múltiplas instâncias, duas réplicas podem executar o mesmo job. A evolução recomendada é um lock distribuído com lease/expiração (por exemplo, Redis) ou scheduler/worker único com fila durável, retries limitados e idempotência.

Para centenas de parceiros, será necessário medir e limitar concorrência, paginar/levar agregações ao banco, revisar índices por organização e datas, controlar pool de conexões, executar análises pesadas em workers e monitorar duração, falhas e atraso dos jobs. Se o volume justificar, particionamento temporal e tabelas agregadas/materializadas podem reduzir custo. O isolamento por `organizacaoId` deve ser aplicado em toda consulta e validado em testes de autorização e segregação entre parceiros.

## Validação e lacunas

Os testes unitários existentes exercitam funções puras e regras analíticas; isso não substitui testes integrados com PostgreSQL, migrações, seed repetido, autenticação/perfis, chamadas HTTP concorrentes e execução de cron. A geração do Prisma Client, compilação completa e suíte integral precisam ser executadas no ambiente com dependências e banco disponíveis. Não se deve considerar migração do zero, seed duas vezes ou as três análises via POST validadas até que esses cenários sejam efetivamente executados.
