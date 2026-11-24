import { VERSAO_API_PUBLICA } from "./middlewareVersao.js";

const openapiPublica = {
    openapi: "3.0.3",
    info: {
        title: "Greencode API Pública",
        version: VERSAO_API_PUBLICA,
        description: "API pública versionada para parceiros. Todas as operações de recursos são limitadas à organização vinculada à chave API e não expõem campos internos de observação. Escopos: tracking:read, batches:read, batches:write, reports:read e reports:generate."
    },
    servers: [{ url: "/api/v1/public" }],
    components: {
        securitySchemes: {
            ApiKey: { type: "apiKey", in: "header", name: "X-API-Key", description: "Chave no formato gc_<prefixo>_<segredo>." }
        },
        schemas: {
            SolicitacaoRelatorio: {
                type: "object",
                required: ["tipo"],
                properties: {
                    tipo: {
                        type: "string",
                        enum: [
                            "EFICIENCIA_OPERACIONAL",
                            "RENTABILIDADE_EQUIPAMENTOS",
                            "PREVISAO_VIDA_UTIL"
                        ]
                    },
                    formato: {
                        type: "string",
                        enum: ["JSON", "CSV"],
                        default: "JSON"
                    },
                    webhookUrl: {
                        type: "string",
                        format: "uri",
                        description: "URL HTTPS opcional para notificação de conclusão assinada com HMAC-SHA256 no cabeçalho X-Greencode-Signature."
                    },
                    parametros: {
                        type: "object",
                        description: "Parâmetros específicos do tipo de relatório (dataInicio, dataFim, unidadePeriodo ou minimoAmostras). organizacaoId é sempre inferido da chave API.",
                        additionalProperties: true
                    }
                },
                example: {
                    tipo: "EFICIENCIA_OPERACIONAL",
                    formato: "CSV",
                    parametros: {
                        dataInicio: "2026-01-01T00:00:00.000Z",
                        dataFim: "2026-11-23T23:59:59.000Z",
                        unidadePeriodo: "MES"
                    }
                }
            },
            TarefaRelatorio: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    tipo: { type: "string", enum: ["EFICIENCIA_OPERACIONAL", "RENTABILIDADE_EQUIPAMENTOS", "PREVISAO_VIDA_UTIL"] },
                    formato: { type: "string", enum: ["CSV", "JSON"] },
                    status: { type: "string", enum: ["NA_FILA", "EM_EXECUCAO", "CONCLUIDA", "FALHOU", "EXPIRADA"] },
                    progresso: { type: "integer", minimum: 0, maximum: 100 },
                    relatorioAnaliticoId: { type: "string", format: "uuid", nullable: true },
                    tamanhoBytes: { type: "integer", nullable: true },
                    erro: { type: "string", nullable: true },
                    tentativas: { type: "integer" },
                    criadoEm: { type: "string", format: "date-time" },
                    iniciadoEm: { type: "string", format: "date-time", nullable: true },
                    concluidoEm: { type: "string", format: "date-time", nullable: true },
                    expiraEm: { type: "string", format: "date-time", nullable: true }
                }
            },
            EnvelopeSucesso: {
                type: "object",
                properties: {
                    nivel: { type: "string", enum: ["SUCESSO"] },
                    mensagem: { type: "string" },
                    dados: { type: "object", additionalProperties: true }
                },
                required: ["nivel", "mensagem", "dados"]
            },
            EnvelopeErro: {
                type: "object",
                properties: {
                    nivel: { type: "string", enum: ["ERRO"] },
                    mensagem: { type: "string" },
                    codigo: { type: "string" }
                },
                required: ["nivel", "mensagem", "codigo"]
            }
        }
    },
    paths: {
        "/relatorios": {
            post: {
                summary: "Solicitar geração assíncrona de relatório analítico",
                description: "Escopo exigido: reports:generate. Enfileira a tarefa e retorna 202 imediatamente. A organização é forçada pela chave API.",
                security: [{ ApiKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/SolicitacaoRelatorio" }
                        }
                    }
                },
                responses: {
                    "202": {
                        description: "Tarefa enfileirada.",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/EnvelopeSucesso" },
                                example: {
                                    nivel: "SUCESSO",
                                    mensagem: "Solicitação de relatório enfileirada com sucesso.",
                                    dados: {
                                        tarefaId: "550e8400-e29b-41d4-a716-446655440000",
                                        statusUrl: "/api/v1/public/relatorios/550e8400-e29b-41d4-a716-446655440000"
                                    }
                                }
                            }
                        }
                    },
                    "400": { description: "DADOS_INVALIDOS ou WEBHOOK_URL_INVALIDA.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "401": { description: "CHAVE_AUSENTE, CHAVE_INVALIDA, CHAVE_EXPIRADA ou CHAVE_REVOGADA.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "403": { description: "ESCOPO_INSUFICIENTE.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "429": { description: "LIMITE_TAREFAS_ATIVAS ou LIMITE_EXCEDIDO.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "503": { description: "FILA_INDISPONIVEL.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } }
                }
            },
            get: {
                summary: "Listar tarefas de relatório da chave API",
                description: "Escopo exigido: reports:read. Retorna apenas tarefas criadas pela chave autenticada.",
                security: [{ ApiKey: [] }],
                parameters: [
                    { name: "pagina", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
                    { name: "limite", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }
                ],
                responses: {
                    "200": { description: "Tarefas paginadas.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeSucesso" } } } },
                    "400": { description: "DADOS_INVALIDOS.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "401": { description: "CHAVE_AUSENTE, CHAVE_INVALIDA, CHAVE_EXPIRADA ou CHAVE_REVOGADA.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "403": { description: "ESCOPO_INSUFICIENTE.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "429": { description: "LIMITE_EXCEDIDO.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } }
                }
            }
        },
        "/relatorios/{id}": {
            get: {
                summary: "Consultar status e progresso de uma tarefa de relatório",
                description: "Escopo exigido: reports:read. Tarefas de outra chave ou organização retornam 404.",
                security: [{ ApiKey: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
                ],
                responses: {
                    "200": { description: "Status atual da tarefa.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeSucesso" } } } },
                    "400": { description: "DADOS_INVALIDOS.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "401": { description: "CHAVE_AUSENTE, CHAVE_INVALIDA, CHAVE_EXPIRADA ou CHAVE_REVOGADA.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "403": { description: "ESCOPO_INSUFICIENTE.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "404": { description: "TAREFA_NAO_ENCONTRADA.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "429": { description: "LIMITE_EXCEDIDO.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } }
                }
            }
        },
        "/relatorios/{id}/download": {
            get: {
                summary: "Baixar arquivo do relatório concluído (CSV ou JSON)",
                description: "Escopo exigido: reports:read. Retorna 409 se ainda não concluído e 410 se expirado.",
                security: [{ ApiKey: [] }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
                ],
                responses: {
                    "200": {
                        description: "Arquivo CSV ou JSON do relatório.",
                        content: {
                            "text/csv": { schema: { type: "string" } },
                            "application/json": { schema: { type: "object" } }
                        }
                    },
                    "401": { description: "CHAVE_AUSENTE, CHAVE_INVALIDA, CHAVE_EXPIRADA ou CHAVE_REVOGADA.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "403": { description: "ESCOPO_INSUFICIENTE.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "404": { description: "TAREFA_NAO_ENCONTRADA.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "409": { description: "RELATORIO_NAO_PRONTO.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "410": { description: "RELATORIO_EXPIRADO.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "429": { description: "LIMITE_EXCEDIDO.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } }
                }
            }
        },
        "/rastreabilidade/equipamentos/{codigoBarras}": {
            get: {
                summary: "Consultar rastreabilidade de equipamento",
                description: "Escopo exigido: tracking:read. Retorna apenas dados públicos do equipamento e movimentações (sem observações internas) da organização da chave.",
                security: [{ ApiKey: [] }],
                parameters: [{ name: "codigoBarras", in: "path", required: true, description: "Código de barras interno do equipamento.", schema: { type: "string" } }],
                responses: {
                    "200": {
                        description: "Rastreabilidade consultada.",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/EnvelopeSucesso" },
                                example: {
                                    nivel: "SUCESSO",
                                    mensagem: "Rastreabilidade consultada com sucesso.",
                                    dados: {
                                        codigoBarrasInterno: "GC-NB-2026-000001",
                                        tipo: "NOTEBOOK",
                                        marca: "Dell",
                                        modelo: "Latitude 5440",
                                        anoFabricacao: 2024,
                                        estadoFisico: "BOM_ESTADO",
                                        pesoQuilogramas: 1.45,
                                        statusRastreamento: "EM_TRIAGEM",
                                        lote: {
                                            id: "LOTE-2026-001",
                                            dataEntrada: "2026-11-10T10:00:00.000Z",
                                            statusProcessamento: "EM_TRIAGEM"
                                        },
                                        historicoMovimentacao: [
                                            {
                                                dataHora: "2026-11-10T10:30:00.000Z",
                                                origem: "Doca de Recebimento",
                                                destino: "Bancada de Triagem 01"
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    },
                    "401": { description: "CHAVE_AUSENTE, CHAVE_INVALIDA, CHAVE_EXPIRADA ou CHAVE_REVOGADA.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "403": { description: "ESCOPO_INSUFICIENTE.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "404": { description: "Equipamento não encontrado nesta organização.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } },
                    "429": { description: "LIMITE_EXCEDIDO.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeErro" } } } }
                }
            }
        },
        "/lotes": {
            get: {
                summary: "Listar lotes da organização",
                description: "Escopo exigido: batches:read. Limite de paginação de 100 registros. Não expõe observações internas.",
                security: [{ ApiKey: [] }],
                parameters: [
                    { name: "pagina", in: "query", description: "Página (começa em 1).", schema: { type: "integer", minimum: 1, default: 1 } },
                    { name: "limite", in: "query", description: "Itens por página (máximo 100).", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
                    { name: "status", in: "query", description: "Status de processamento do lote.", schema: { type: "string" } },
                    { name: "dataInicio", in: "query", description: "Data inicial inclusiva em ISO 8601.", schema: { type: "string", format: "date-time" } },
                    { name: "dataFim", in: "query", description: "Data final inclusiva em ISO 8601.", schema: { type: "string", format: "date-time" } }
                ],
                responses: {
                    "200": {
                        description: "Lotes paginados.",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/EnvelopeSucesso" },
                                example: {
                                    nivel: "SUCESSO",
                                    mensagem: "Lotes consultados com sucesso.",
                                    dados: {
                                        lotes: [
                                            {
                                                id: "LOTE-2026-001",
                                                dataEntrada: "2026-11-10T10:00:00.000Z",
                                                notaFiscal: "NF-123",
                                                transportadora: "Transportadora Exemplo",
                                                statusProcessamento: "RECEBIDO",
                                                _count: { equipamentos: 5 }
                                            }
                                        ],
                                        pagina: 1,
                                        limite: 20,
                                        total: 1,
                                        totalPaginas: 1
                                    }
                                }
                            }
                        }
                    },
                    "400": { description: "PERIODO_INVALIDO ou parâmetros inválidos." },
                    "401": { description: "CHAVE_AUSENTE, CHAVE_INVALIDA, CHAVE_EXPIRADA ou CHAVE_REVOGADA." },
                    "403": { description: "ESCOPO_INSUFICIENTE." },
                    "429": { description: "LIMITE_EXCEDIDO." }
                }
            },
            post: {
                summary: "Criar lote para a organização da chave",
                description: "Escopo exigido: batches:write. A organização é forçada a partir da chave e não pode ser definida pelo corpo.",
                security: [{ ApiKey: [] }],
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["nf", "transp"], properties: { nf: { type: "string", maxLength: 100 }, transp: { type: "string", maxLength: 120 }, dataEntrada: { type: "string", format: "date-time" }, observacoes: { type: "string" } } }, example: { nf: "NF-123", transp: "Transportadora Exemplo" } } } },
                responses: {
                    "201": { description: "Lote criado.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeSucesso" } } } },
                    "400": { description: "Dados inválidos." },
                    "401": { description: "CHAVE_AUSENTE, CHAVE_INVALIDA, CHAVE_EXPIRADA ou CHAVE_REVOGADA." },
                    "403": { description: "ESCOPO_INSUFICIENTE." },
                    "429": { description: "LIMITE_EXCEDIDO." }
                }
            }
        },
        "/lotes/{id}": {
            get: {
                summary: "Consultar lote",
                description: "Escopo exigido: batches:read. Lotes de outras organizações são tratados como inexistentes. Não expõe observações internas.",
                security: [{ ApiKey: [] }],
                parameters: [{ name: "id", in: "path", required: true, description: "Identificador do lote.", schema: { type: "string" } }],
                responses: {
                    "200": {
                        description: "Lote encontrado.",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/EnvelopeSucesso" },
                                example: {
                                    nivel: "SUCESSO",
                                    mensagem: "Lote consultado com sucesso.",
                                    dados: {
                                        id: "LOTE-2026-001",
                                        dataEntrada: "2026-11-10T10:00:00.000Z",
                                        notaFiscal: "NF-123",
                                        transportadora: "Transportadora Exemplo",
                                        statusProcessamento: "RECEBIDO",
                                        equipamentos: []
                                    }
                                }
                            }
                        }
                    },
                    "401": { description: "CHAVE_AUSENTE, CHAVE_INVALIDA, CHAVE_EXPIRADA ou CHAVE_REVOGADA." },
                    "403": { description: "ESCOPO_INSUFICIENTE." },
                    "404": { description: "LOTE_NAO_ENCONTRADO." },
                    "429": { description: "LIMITE_EXCEDIDO." }
                }
            }
        }
    }
};

export default openapiPublica;
