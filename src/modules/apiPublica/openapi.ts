const openapiPublica = {
    openapi: "3.0.3",
    info: {
        title: "Greencode API Pública",
        version: "1.0.0",
        description: "API pública versionada para parceiros. Todas as operações de recursos são limitadas à organização vinculada à chave API. Escopos: tracking:read, batches:read, batches:write, reports:read e reports:generate."
    },
    servers: [{ url: "/api/v1/public" }],
    components: {
        securitySchemes: {
            ApiKey: { type: "apiKey", in: "header", name: "X-API-Key", description: "Chave no formato gc_<prefixo>_<segredo>." }
        },
        schemas: {
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
        "/rastreabilidade/equipamentos/{codigoBarras}": {
            get: {
                summary: "Consultar rastreabilidade de equipamento",
                description: "Escopo exigido: tracking:read. A consulta só retorna equipamentos da organização da chave.",
                security: [{ ApiKey: [] }],
                parameters: [{ name: "codigoBarras", in: "path", required: true, description: "Código de barras interno do equipamento.", schema: { type: "string" } }],
                responses: {
                    "200": { description: "Rastreabilidade consultada.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeSucesso" } } } },
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
                description: "Escopo exigido: batches:read. Limite de paginação de 100 registros.",
                security: [{ ApiKey: [] }],
                parameters: [
                    { name: "pagina", in: "query", description: "Página (começa em 1).", schema: { type: "integer", minimum: 1, default: 1 } },
                    { name: "limite", in: "query", description: "Itens por página (máximo 100).", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
                    { name: "status", in: "query", description: "Status de processamento do lote.", schema: { type: "string" } },
                    { name: "dataInicio", in: "query", description: "Data inicial inclusiva em ISO 8601.", schema: { type: "string", format: "date-time" } },
                    { name: "dataFim", in: "query", description: "Data final inclusiva em ISO 8601.", schema: { type: "string", format: "date-time" } }
                ],
                responses: {
                    "200": { description: "Lotes paginados.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeSucesso" } } } },
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
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["nf", "transp"], properties: { nf: { type: "string", maxLength: 100 }, transp: { type: "string", maxLength: 120 }, dataEntrada: { type: "string", format: "date-time" }, observacoes: { type: "string" } } }, example: { nf: "NF-123", transp: "Transportadora Exemplo", observacoes: "Coleta de equipamentos" } } } },
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
                description: "Escopo exigido: batches:read. Lotes de outras organizações são tratados como inexistentes.",
                security: [{ ApiKey: [] }],
                parameters: [{ name: "id", in: "path", required: true, description: "Identificador do lote.", schema: { type: "string" } }],
                responses: {
                    "200": { description: "Lote encontrado.", content: { "application/json": { schema: { $ref: "#/components/schemas/EnvelopeSucesso" } } } },
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
