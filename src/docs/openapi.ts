const resposta = {
    type: "object",
    properties: {
        nivel: { type: "string", example: "SUCESSO" },
        mensagem: { type: "string", example: "Operação realizada com sucesso." },
        dados: {
            oneOf: [
                { type: "object", additionalProperties: true },
                { type: "array", items: { type: "object", additionalProperties: true } },
            ],
        },
    },
};

const jsonBody = (example: Record<string, unknown>, description = "JSON de exemplo. Ajuste os campos conforme a operação.") => ({
    required: true,
    description,
    content: {
        "application/json": {
            schema: { type: "object", additionalProperties: true, example },
            example,
        },
    },
});

const pathId = {
    name: "id",
    in: "path",
    required: true,
    description: "Identificador do registro.",
    schema: { type: "string", example: "fla-1895-uuid" },
};

interface OpcoesOperacao {
    public?: boolean;
    created?: boolean;
    parameters?: unknown[];
    requestBody?: ReturnType<typeof jsonBody>;
    description?: string;
    responseExample?: Record<string, unknown>;
    additionalResponses?: Record<string, unknown>;
}

function respostaDeErro(
    codigo: string,
    mensagem: string,
    descricao: string,
) {
    return {
        description: descricao,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        nivel: { type: "string", example: "ERRO" },
                        mensagem: { type: "string", example: mensagem },
                        codigo: { type: "string", example: codigo },
                    },
                },
                example: { nivel: "ERRO", mensagem, codigo },
            },
        },
    };
}

const op = (
    summary: string,
    tags: string[],
    options: OpcoesOperacao = {},
) => {
    const exemploResposta = options.responseExample;
    const conteudoResposta = {
        schema: resposta,
        ...(exemploResposta ? { example: exemploResposta } : {}),
    };

    return {
        summary,
        tags,
        ...(options.description ? { description: options.description } : {}),
        security: options.public ? [] : [{ bearerAuth: [] }],
        ...(options.parameters ? { parameters: options.parameters } : {}),
        ...(options.requestBody ? { requestBody: options.requestBody } : {}),
        responses: {
            "200": {
                description: "Requisição processada.",
                content: { "application/json": conteudoResposta },
            },
            ...(options.created ? {
                "201": {
                    description: "Registro criado.",
                    content: { "application/json": conteudoResposta },
                },
            } : {}),
            "400": respostaDeErro(
                "DADOS_INVALIDOS",
                "Os dados enviados são inválidos.",
                "Validação do corpo, parâmetros ou filtros falhou.",
            ),
            "401": respostaDeErro(
                "TOKEN_INVALIDO",
                "Token ausente, inválido ou expirado.",
                "Autenticação necessária.",
            ),
            "403": respostaDeErro(
                "PERMISSAO_NEGADA",
                "Você não tem permissão para executar esta operação.",
                "Perfil sem autorização para a operação.",
            ),
            "404": respostaDeErro(
                "RECURSO_NAO_ENCONTRADO",
                "Registro não encontrado.",
                "O recurso solicitado não existe.",
            ),
            "500": respostaDeErro(
                "ERRO_INTERNO",
                "Erro interno do servidor.",
                "Falha inesperada no servidor.",
            ),
            ...options.additionalResponses,
        },
    };
};

const query = (name: string, description: string, example = "") => ({ name, in: "query", required: false, description, schema: { type: "string", ...(example ? { example } : {}) } });

const openapi = {
    openapi: "3.0.3",
    info: {
        title: "Greencode API - Futebol Edition",
        version: "1.0.0",
        description: "Documentação interativa da Greencode API. Os exemplos JSON aparecem preenchidos no campo Request body antes de clicar em **Execute**. Para rotas protegidas, use **Authorize** e informe um token JWT obtido em `/auth/login`.",
        contact: { name: "Greencode API" },
    },
    servers: [{ url: "http://localhost:3000", description: "Servidor local" }],
    tags: [
        { name: "Saúde", description: "Verificação da API e do banco." },
        { name: "Autenticação", description: "Login, sessão e senha." },
        { name: "Usuários", description: "Administração de usuários." },
        { name: "Organizações", description: "Cadastro e gerenciamento de organizações/clientes." },
        { name: "Contratos", description: "Gerenciamento de contratos." },
        { name: "Lotes", description: "Recebimento, triagem e acompanhamento de lotes." },
        { name: "Equipamentos", description: "Cadastro, consulta e rastreamento de equipamentos." },
        { name: "Configuração", description: "Configurações da aplicação." },
        { name: "Auditoria", description: "Registros de auditoria." },
        { name: "Relatórios", description: "Relatórios operacionais e financeiros." },
        { name: "Analytics", description: "Análises de eficiência operacional, rentabilidade e previsão de vida útil." },
    ],
    components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Cole somente o token JWT retornado por /auth/login." } },
    },
    paths: {
        "/": { get: op("Verificar se a API está ativa", ["Saúde"], { public: true }) },
        "/health/db": { get: op("Verificar conexão com PostgreSQL", ["Saúde"], { public: true }) },
        "/auth/login": { post: op("Autenticar usuário", ["Autenticação"], { public: true, created: false, requestBody: jsonBody({ usuario: "zico.camisa10", senha: "Flamengo1895!" }) }) },
        "/auth/me": { get: op("Consultar usuário autenticado", ["Autenticação"]) },
        "/auth/logout": { post: op("Encerrar sessão", ["Autenticação"]) },
        "/auth/senha": { patch: op("Alterar senha do usuário autenticado", ["Autenticação"], { requestBody: jsonBody({ senhaAtual: "Gabeigol2019!", senhaNova: "Mengaow2026!", confirmarSenha: "Mengaow2026!" }) }) },
        "/usuarios": {
            get: op("Listar usuários", ["Usuários"]),
            post: op("Cadastrar usuário", ["Usuários"], { created: true, requestBody: jsonBody({ nome: "Reinaldo Jácome", usuario: "reinaldo.atletico", senha: "GaloDoido1908!", tipo: "OPERADOR_CADASTRO" }) }),
        },
        "/usuarios/inativos": { get: op("Listar usuários inativos", ["Usuários"]) },
        "/usuarios/buscar": { get: op("Buscar usuários", ["Usuários"], { parameters: [query("nome", "Nome ou parte do nome para busca", "Reinaldo")] }) },
        "/usuarios/{id}": {
            get: op("Consultar usuário por ID", ["Usuários"], { parameters: [pathId] }),
            put: op("Atualizar usuário", ["Usuários"], { parameters: [pathId], requestBody: jsonBody({ nome: "Reinaldo Jácome", usuario: "reinaldo.atletico", tipo: "OPERADOR_CADASTRO", ativo: true }) }),
            delete: op("Excluir usuário", ["Usuários"], { parameters: [pathId] }),
        },
        "/usuarios/{id}/status": { patch: op("Alterar status do usuário", ["Usuários"], { parameters: [pathId], requestBody: jsonBody({ ativo: false }) }) },
        "/organizacoes": {
            get: op("Listar organizações ativas", ["Organizações"]),
            post: op("Cadastrar organização", ["Organizações"], { created: true, requestBody: jsonBody({ id: "org-fla-01", razaoSocial: "Clube de Regatas do Flamengo", cnpj: "33649575000199", inscricaoEstadual: "10293847", enderecoCompleto: "Av. Borges de Medeiros, 997 - Lagoa, Rio de Janeiro/RJ", telefone: "2121590000", email: "contato@flamengo.com.br", vencimentoContrato: "2028-12-31T00:00:00.000Z", valorMensal: 850000 }) }),
        },
        "/organizacoes/buscar": { get: op("Buscar organizações por nome", ["Organizações"], { parameters: [query("nome", "Nome da organização", "Palmeiras")] }) },
        "/organizacoes/{id}": {
            get: op("Consultar organização", ["Organizações"], { parameters: [pathId] }),
            patch: op("Editar organização", ["Organizações"], { parameters: [pathId], requestBody: jsonBody({ razaoSocial: "Sociedade Esportiva Palmeiras", email: "atendimento@palmeiras.com.br" }) }),
            delete: op("Excluir organização", ["Organizações"], { parameters: [pathId] }),
        },
        "/organizacoes/{id}/desativar": { patch: op("Desativar organização", ["Organizações"], { parameters: [pathId] }) },
        "/organizacoes/{id}/ativar": { patch: op("Ativar organização", ["Organizações"], { parameters: [pathId] }) },
        "/organizacoes/{id}/contrato/renovar": { patch: op("Renovar contrato da organização", ["Organizações"], { parameters: [pathId], requestBody: jsonBody({ novoVencimento: "2029-12-31T00:00:00.000Z" }) }) },
        "/contratos": {
            get: op("Listar contratos", ["Contratos"]),
            post: op("Criar contrato", ["Contratos"], { created: true, requestBody: jsonBody({ organizacaoId: "org-sccp-02", dataInicio: "2026-01-01T00:00:00.000Z", dataFim: "2027-12-31T00:00:00.000Z", valorMensal: 500000 }) }),
        },
        "/contratos/{id}": {
            get: op("Consultar contrato", ["Contratos"], { parameters: [pathId] }),
            put: op("Atualizar contrato", ["Contratos"], { parameters: [pathId], requestBody: jsonBody({ dataInicio: "2026-01-01T00:00:00.000Z", dataFim: "2028-12-31T00:00:00.000Z", valorMensal: 550000 }) }),
            delete: op("Excluir contrato", ["Contratos"], { parameters: [pathId] }),
        },
        "/contratos/organizacao/{organizacaoId}": { get: op("Consultar contrato por organização", ["Contratos"], { parameters: [{ name: "organizacaoId", in: "path", required: true, schema: { type: "string", example: "org-fla-01" } }] }) },
        "/lotes": {
            get: op("Listar lotes com filtros opcionais", ["Lotes"], { parameters: [query("status", "Status do lote", "RECEBIDO"), query("dataInicio", "Data inicial ISO 8601", "2026-01-01T00:00:00.000Z"), query("dataFim", "Data final ISO 8601", "2026-12-31T23:59:59.000Z"), query("nf", "Número da nota fiscal", "NF-MARACANA-2026")] }),
            post: op("Cadastrar lote", ["Lotes"], { created: true, requestBody: jsonBody({ organizacaoId: "org-fla-01", notaFiscal: "NF-MARACANA-2026", dataRecebimento: "2026-10-26T12:00:00.000Z", observacoes: "Lote de catracas e placas LED para o Maracanã" }) }),
        },
        "/lotes/{id}": {
            get: op("Consultar lote", ["Lotes"], { parameters: [pathId] }),
            patch: op("Editar lote", ["Lotes"], { parameters: [pathId], requestBody: jsonBody({ notaFiscal: "NF-NEOQUIMICA-2026", observacoes: "Lote de coletores do setor Norte" }) }),
            delete: op("Excluir lote", ["Lotes"], { parameters: [pathId] }),
        },
        "/lotes/{id}/triagem": { post: op("Registrar triagem do lote", ["Lotes"], { parameters: [pathId], requestBody: jsonBody({ observacoes: "Triagem concluída no MorumBIS" }) }) },
        "/lotes/{id}/cancelar": { patch: op("Cancelar lote", ["Lotes"], { parameters: [pathId], requestBody: jsonBody({ motivo: "Equipamentos entregues no CT do Caju por engano" }) }) },
        "/equipamentos": {
            get: op("Listar equipamentos", ["Equipamentos"], { parameters: [query("loteId", "Filtrar pelo ID do lote"), query("tipo", "Tipo de equipamento", "CATRACA_ELETRONICA"), query("estadoFisico", "Estado físico", "EXCELENTE"), query("statusRastreamento", "Status de rastreamento", "EM_CAMPO"), query("busca", "Buscar por texto")] }),
            post: op("Cadastrar equipamento", ["Equipamentos"], { created: true, requestBody: jsonBody({ loteId: "lote-allianz-01", tipo: "COLETOR_DADOS", marca: "Zebra", modelo: "TC21 Palestra", anoFabricacao: 2025, numeroSerie: "SN-PALM-1914", estadoFisico: "EXCELENTE", observacoes: "Usado na biometria facial do Allianz Parque" }) }),
        },
        "/equipamentos/codigo-barras": { post: op("Gerar código de barras interno", ["Equipamentos"], { requestBody: jsonBody({ tipo: "CATRACA_ELETRONICA", sequencia: 10 }) }) },
        "/equipamentos/{id}": {
            get: op("Consultar equipamento", ["Equipamentos"], { parameters: [pathId] }),
            patch: op("Editar equipamento", ["Equipamentos"], { parameters: [pathId], requestBody: jsonBody({ tipo: "COLETOR_DADOS", marca: "Zebra", modelo: "TC21 Palestra", anoFabricacao: 2025, numeroSerie: "SN-PALM-1914" }) }),
            delete: op("Excluir equipamento", ["Equipamentos"], { parameters: [pathId] }),
        },
        "/equipamentos/{id}/rastreamento": { get: op("Consultar histórico de rastreamento", ["Equipamentos"], { parameters: [pathId] }), patch: op("Atualizar status de rastreamento", ["Equipamentos"], { parameters: [pathId], requestBody: jsonBody({ statusRastreamento: "EM_MANUTENCAO", responsavel: "Deyverson Silva", observacao: "Enviado para reparo na São Januário Tecnologias" }) }) },
        "/equipamentos/{id}/depreciacao": { get: op("Calcular depreciação do equipamento", ["Equipamentos"], { parameters: [pathId] }) },
        "/equipamentos/{id}/recuperacao": {
            get: op("Listar registros de recuperação financeira", ["Equipamentos"], {
                parameters: [pathId],
                description: "Perfis permitidos: ADMINISTRADOR e GESTOR_ALMOXARIFADO.",
                responseExample: { nivel: "SUCESSO", mensagem: "Recuperações consultadas com sucesso.", dados: [{ id: "rec-uuid", valorRecuperacao: "125.50", registradoEm: "2026-11-02T12:00:00.000Z", observacao: "Recuperação de componentes." }] },
                additionalResponses: { "404": respostaDeErro("EQUIPAMENTO_NAO_ENCONTRADO", "Equipamento não encontrado.", "O equipamento informado não existe.") },
            }),
            post: op("Registrar recuperação financeira", ["Equipamentos"], {
                parameters: [pathId],
                created: true,
                description: "Perfis permitidos: ADMINISTRADOR e GESTOR_ALMOXARIFADO.",
                requestBody: jsonBody({ valorRecuperacao: 125.50, observacao: "Recuperação de componentes e mão de obra." }),
                responseExample: { nivel: "SUCESSO", mensagem: "Recuperação registrada com sucesso.", dados: { id: "rec-uuid", valorRecuperacao: "125.50" } },
                additionalResponses: { "404": respostaDeErro("EQUIPAMENTO_NAO_ENCONTRADO", "Equipamento não encontrado.", "O equipamento informado não existe.") },
            })
        },
        "/equipamentos/{id}/observacoes-condicao": {
            get: op("Listar observações de condição do equipamento", ["Equipamentos"], {
                parameters: [pathId],
                description: "Perfis permitidos: ADMINISTRADOR e GESTOR_ALMOXARIFADO. Escala: 100 = perfeito; 0 = inservível.",
                responseExample: { nivel: "SUCESSO", mensagem: "Observações de condição consultadas com sucesso.", dados: [{ id: "obs-uuid", indiceCondicao: 78, falhaRegistrada: true, observadoEm: "2026-10-05T12:00:00.000Z", observacao: "Falha intermitente." }] },
                additionalResponses: { "404": respostaDeErro("EQUIPAMENTO_NAO_ENCONTRADO", "Equipamento não encontrado.", "O equipamento informado não existe.") },
            }),
            post: op("Registrar observação de condição (100 = perfeito; 0 = inservível)", ["Equipamentos"], {
                parameters: [pathId],
                created: true,
                description: "Perfis permitidos: ADMINISTRADOR e GESTOR_ALMOXARIFADO. O índice deve estar entre 0 e 100.",
                requestBody: jsonBody({ indiceCondicao: 78, falhaRegistrada: true, observacao: "Falha intermitente identificada durante inspeção." }),
                responseExample: { nivel: "SUCESSO", mensagem: "Observação de condição registrada com sucesso.", dados: { id: "obs-uuid", indiceCondicao: 78, falhaRegistrada: true } },
                additionalResponses: { "404": respostaDeErro("EQUIPAMENTO_NAO_ENCONTRADO", "Equipamento não encontrado.", "O equipamento informado não existe.") },
            })
        },
        "/equipamentos/{id}/movimentacoes": { post: op("Registrar movimentação de equipamento", ["Equipamentos"], { parameters: [pathId], created: true, requestBody: jsonBody({ destino: "Almoxarifado Beira-Rio", responsavel: "Fernandão Silva", observacao: "Transferência para partida do Brasileirão" }) }) },
        "/equipamentos/{id}/estado-fisico": { patch: op("Atualizar estado físico do equipamento", ["Equipamentos"], { parameters: [pathId], requestBody: jsonBody({ estadoFisico: "BOM_ESTADO", justificativa: "Inspeção pós-jogo concluída no Couto Pereira", responsavel: "Alex de Souza" }) }) },
        "/api/v1/internal/analytics/eficiencia-operacional": {
            post: op("Executar análise de eficiência operacional", ["Analytics"], {
                created: true,
                description: "Perfis permitidos: ADMINISTRADOR e GESTOR_ALMOXARIFADO. Calcula duração de triagem por operador e compara com o período anterior de mesma duração.",
                requestBody: jsonBody({ organizacaoId: "ORG002", dataInicio: "2026-08-01T00:00:00.000Z", dataFim: "2026-11-30T23:59:59.999Z", unidadePeriodo: "MES" }),
                responseExample: { nivel: "SUCESSO", mensagem: "Análise de eficiência operacional concluída.", dados: { relatorioId: "rel-uuid", tipo: "EFICIENCIA_OPERACIONAL", resumo: { quantidadeLotes: 12, tempoMedioHoras: 18.4, tempoMedianoHoras: 16, desvioPadraoHoras: 4.2, tempoMedioPeriodoAnteriorHoras: 22.1, variacaoPercentual: -16.74, quantidadeGargalos: 1 }, resultados: [{ operadorId: "usuario-uuid", nomeOperador: "Operador Seed", quantidadeLotes: 6, tempoMedioHoras: 18.4, gargalo: false }] } },
                additionalResponses: {
                    "404": respostaDeErro("ORGANIZACAO_NAO_ENCONTRADA", "Organização não encontrada.", "A organização informada não existe."),
                },
            }),
        },
        "/api/v1/internal/analytics/rentabilidade": {
            post: op("Executar análise de rentabilidade dos equipamentos", ["Analytics"], {
                created: true,
                description: "Perfis permitidos: ADMINISTRADOR e GESTOR_ALMOXARIFADO. Agrupa recuperações por tipo, estado físico, marca e modelo, ordenando pela recuperação média e total.",
                requestBody: jsonBody({ organizacaoId: "ORG001", dataInicio: "2026-01-01T00:00:00.000Z", dataFim: "2026-12-31T23:59:59.999Z" }),
                responseExample: { nivel: "SUCESSO", mensagem: "Análise de rentabilidade concluída.", dados: { relatorioId: "rel-uuid", tipo: "RENTABILIDADE_EQUIPAMENTOS", resumo: { quantidadeRegistros: 5, valorTotalRecuperacao: 3001.25, quantidadeGrupos: 4 }, resultados: [{ tipoEquipamento: "NOTEBOOK", estadoFisico: "USADO_LEVE", marca: "Lenovo", modelo: "ThinkPad", quantidade: 2, valorTotalRecuperacao: 900, valorMedioRecuperacao: 450, posicaoRanking: 1 }] } },
                additionalResponses: {
                    "404": respostaDeErro("ORGANIZACAO_NAO_ENCONTRADA", "Organização não encontrada.", "A organização informada não existe."),
                },
            }),
        },
        "/api/v1/internal/analytics/vida-util": {
            post: op("Executar previsão de vida útil", ["Analytics"], {
                created: true,
                description: "Perfis permitidos: ADMINISTRADOR e GESTOR_ALMOXARIFADO. A regressão é calculada separadamente por equipamento; o resultado do grupo usa medianas das vidas e dos R².",
                requestBody: jsonBody({ organizacaoId: "ORG001", minimoAmostras: 3 }),
                responseExample: { nivel: "SUCESSO", mensagem: "Previsão de vida útil concluída.", dados: { relatorioId: "rel-uuid", tipo: "PREVISAO_VIDA_UTIL", resumo: { gruposAnalisados: 1, previsoesDisponiveis: 1, equipamentosIgnorados: 0, metodologia: "Regressão linear individual por equipamento." }, resultados: [{ tipoEquipamento: "NOTEBOOK", marca: "Dell", modelo: "Latitude", amostras: 8, metodo: "REGRESSAO_LINEAR", rQuadrado: 0.98, vidaRemanescenteMeses: 5.2, dataPrevistaInservivel: "2027-04-22T00:00:00.000Z", equipamentosAnalisados: 2, taxaFalhas: 0.5, previsaoDisponivel: true, motivoIndisponivel: null }] } },
                additionalResponses: {
                    "404": respostaDeErro("ORGANIZACAO_NAO_ENCONTRADA", "Organização não encontrada.", "A organização informada não existe."),
                },
            }),
        },
        "/api/v1/internal/analytics/historico": {
            get: op("Consultar histórico de relatórios analíticos", ["Analytics"], {
                parameters: [query("tipo", "Tipo de relatório", "EFICIENCIA_OPERACIONAL"), query("organizacaoId", "ID da organização", "ORG001"), query("inicio", "Data inicial ISO 8601", "2026-01-01T00:00:00.000Z"), query("fim", "Data final ISO 8601", "2026-12-31T23:59:59.999Z"), query("limite", "Quantidade de relatórios (1 a 100; padrão 20)", "20")],
                description: "Disponível para qualquer perfil autenticado.",
                responseExample: { nivel: "SUCESSO", mensagem: "Histórico analítico consultado.", dados: [{ id: "rel-eficiencia", tipo: "EFICIENCIA_OPERACIONAL", geradoEm: "2026-11-22T12:00:00.000Z", versaoModelo: "1.0.0", resumo: { quantidadeLotes: 12, quantidadeGargalos: 1 }, resultadosEficiencia: [{ gargalo: true }] }, { id: "rel-rentabilidade", tipo: "RENTABILIDADE_EQUIPAMENTOS", geradoEm: "2026-11-22T12:10:00.000Z", versaoModelo: "1.0.0", resumo: { quantidadeRegistros: 5, valorTotalRecuperacao: 3001.25, quantidadeGrupos: 4 }, resultadosRentabilidade: [] }] },
            }),
        },
        "/api/v1/internal/analytics/historico/{id}": {
            get: op("Consultar relatório analítico por ID", ["Analytics"], {
                parameters: [{ ...pathId, schema: { type: "string", format: "uuid", example: "00000000-0000-4000-8000-000000000001" } }],
                description: "Disponível para qualquer perfil autenticado.",
                responseExample: { nivel: "SUCESSO", mensagem: "Relatório analítico consultado.", dados: { id: "rel-uuid", tipo: "RENTABILIDADE_EQUIPAMENTOS", geradoEm: "2026-11-22T12:00:00.000Z", versaoModelo: "1.0.0", resumo: { quantidadeRegistros: 5, valorTotalRecuperacao: 3001.25, quantidadeGrupos: 4 }, resultadosRentabilidade: [] } },
                additionalResponses: {
                    "404": respostaDeErro("RELATORIO_NAO_ENCONTRADO", "Relatório analítico não encontrado.", "Não existe relatório com o UUID informado."),
                },
            }),
        },
        "/configuracao": {
            get: op("Consultar configurações", ["Configuração"]),
            patch: op("Atualizar configurações", ["Configuração"], { requestBody: jsonBody({ aliquotaImposto: 0.05, coeficienteDepreciacao: 0.08 }) }),
        },
        "/auditoria": { get: op("Consultar registros de auditoria", ["Auditoria"], { parameters: [query("usuarioId", "Filtrar por ID do usuário"), query("entidade", "Filtrar por entidade", "Equipamento"), query("entidadeId", "Filtrar por ID da entidade"), query("limite", "Quantidade máxima de registros", "100")] }) },
        "/relatorios/organizacao": { get: op("Relatório por organização", ["Relatórios"], { parameters: [query("organizacaoId", "ID da organização", "org-fla-01")] }) },
        "/relatorios/status": { get: op("Relatório por status", ["Relatórios"], { parameters: [query("status", "Status a consultar", "EM_CAMPO")] }) },
        "/relatorios/financeiro": { get: op("Relatório financeiro", ["Relatórios"], { parameters: [query("inicio", "Data inicial ISO 8601", "2026-01-01T00:00:00.000Z"), query("fim", "Data final ISO 8601", "2026-12-31T23:59:59.000Z")] }) },
        "/relatorios/rastreamento/{id}": { get: op("Consultar rastreamento de equipamento", ["Relatórios"], { parameters: [pathId] }) },
        "/relatorios/journal": { get: op("Consultar journal de auditoria", ["Relatórios"], { parameters: [query("limite", "Quantidade máxima de registros (até 500)", "200")] }) },
    },
};

export default openapi;