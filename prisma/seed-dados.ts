import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

function calcularDigitoCNPJ(base: string): number {
    const pesos = base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const soma = [...base].reduce(
        (total, digito, indice) => total + Number(digito) * pesos[indice],
        0
    );

    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
}

function gerarCNPJ(base12: string): string {
    const base = base12.replace(/\D/g, "");

    if (base.length !== 12) {
        throw new Error("A base de CNPJ deve conter 12 dígitos.");
    }

    const primeiro = calcularDigitoCNPJ(base);
    const baseComPrimeiroDigito = `${base}${primeiro}`;
    const segundo = calcularDigitoCNPJ(baseComPrimeiroDigito);

    return `${baseComPrimeiroDigito}${segundo}`;
}

function diasAPartirDeHoje(dias: number): Date {
    const data = new Date();

    data.setHours(12, 0, 0, 0);
    data.setDate(data.getDate() + dias);

    return data;
}

async function main() {
    const senha = process.env.ADM_SENHA;

    if (!senha || senha.length < 8) {
        throw new Error(
            "Defina ADM_SENHA no .env com pelo menos 8 caracteres."
        );
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const usuarios = [
        {
            id: "10000000-0000-4000-8000-000000000001",
            nome: "Administrador de Teste",
            usuario: "admin.seed",
            papel: "ADMINISTRADOR" as const
        },
        {
            id: "10000000-0000-4000-8000-000000000002",
            nome: "Operador de Cadastro",
            usuario: "operador.seed",
            papel: "OPERADOR_CADASTRO" as const
        },
        {
            id: "10000000-0000-4000-8000-000000000003",
            nome: "Gestor de Almoxarifado",
            usuario: "gestor.seed",
            papel: "GESTOR_ALMOXARIFADO" as const
        },
        {
            id: "10000000-0000-4000-8000-000000000004",
            nome: "Auditor de Teste",
            usuario: "auditor.seed",
            papel: "AUDITOR" as const
        }
    ];

    for (const usuario of usuarios) {
        await prisma.usuario.upsert({
            where: { usuario: usuario.usuario },
            update: {
                nome: usuario.nome,
                senhaHash,
                papel: usuario.papel,
                ativo: true
            },
            create: {
                ...usuario,
                senhaHash,
                ativo: true
            }
        });
    }

    const organizacoes = [
        {
            id: "ORG001",
            codigo: "ORG001",
            razaoSocial: "Recicla Tecnologia Ltda.",
            cnpj: gerarCNPJ("123456780001"),
            inscricaoEstadual: "110042490114",
            enderecoCompleto: "Rua das Flores, 120 - São Paulo/SP",
            telefone: "1130001001",
            email: "contato@reciclatecnologia.example",
            ativo: true,
            diasVencimento: 90,
            valorMensal: "1250.00"
        },
        {
            id: "ORG002",
            codigo: "ORG002",
            razaoSocial: "Verde Circular S.A.",
            cnpj: gerarCNPJ("234567890001"),
            inscricaoEstadual: "244991120",
            enderecoCompleto: "Av. Industrial, 450 - São José dos Campos/SP",
            telefone: "1230002002",
            email: "operacao@verdecircular.example",
            ativo: true,
            diasVencimento: 30,
            valorMensal: "2400.00"
        },
        {
            id: "ORG003",
            codigo: "ORG003",
            razaoSocial: "EcoDados Serviços Ambientais Ltda.",
            cnpj: gerarCNPJ("345678900001"),
            inscricaoEstadual: "",
            enderecoCompleto: "Rua do Porto, 75 - Campinas/SP",
            telefone: "1930003003",
            email: "suporte@ecodados.example",
            ativo: true,
            diasVencimento: -30,
            valorMensal: "980.50"
        },
        {
            id: "ORG004",
            codigo: "ORG004",
            razaoSocial: "Reuso Digital Comércio Ltda.",
            cnpj: gerarCNPJ("456789010001"),
            inscricaoEstadual: "",
            enderecoCompleto: "Av. Central, 900 - Taubaté/SP",
            telefone: "1230004004",
            email: "financeiro@reusodigital.example",
            ativo: false,
            diasVencimento: 180,
            valorMensal: "750.00"
        }
    ];

    for (const [indice, organizacao] of organizacoes.entries()) {
        const {
            diasVencimento,
            valorMensal,
            ...dados
        } = organizacao;
        await prisma.organizacao.upsert({
            where: { id: dados.id },
            update: {
                ...dados,
                dataCadastro: diasAPartirDeHoje(-180)
            },
            create: {
                ...dados,
                dataCadastro: diasAPartirDeHoje(-180)
            }
        });

        await prisma.contrato.upsert({
            where: { organizacaoId: dados.id },
            update: {
                dataAssinatura: diasAPartirDeHoje(-365),
                dataVencimento: diasAPartirDeHoje(diasVencimento),
                clausulas: 8,
                valorMensal,
                renovacaoAutomatica: dados.ativo
            },
            create: {
                id: `20000000-0000-4000-8000-${String(indice + 1).padStart(12, "0")}`,
                organizacaoId: dados.id,
                dataAssinatura: diasAPartirDeHoje(-365),
                dataVencimento: diasAPartirDeHoje(diasVencimento),
                clausulas: 8,
                valorMensal,
                renovacaoAutomatica: dados.ativo
            }
        });
    }

    const lotes = [
        {
            id: "LOTE-2026-001",
            organizacaoId: "ORG001",
            notaFiscal: "NF-SEED-1001",
            transportadora: "Logística Verde",
            statusProcessamento: "RECEBIDO" as const,
            observacoes: "Lote de demonstração recém-recebido.",
            dias: -2,
            triagemConcluidaEm: null,
            triagemResponsavelId: null
        },
        {
            id: "LOTE-2026-002",
            organizacaoId: "ORG001",
            notaFiscal: "NF-SEED-1002",
            transportadora: "TransEco",
            statusProcessamento: "EM_TRIAGEM" as const,
            observacoes: "Triagem em andamento.",
            dias: -5,
            triagemConcluidaEm: null,
            triagemResponsavelId: null
        },
        {
            id: "LOTE-2026-003",
            organizacaoId: "ORG002",
            notaFiscal: "NF-SEED-2001",
            transportadora: "Carga Limpa",
            statusProcessamento: "TRIAGEM_CONCLUIDA" as const,
            observacoes: "Triagem concluída.",
            dias: -100,
            triagemConcluidaEm: new Date("2026-08-15T12:00:00.000Z"),
            triagemResponsavelId: "10000000-0000-4000-8000-000000000002"
        },
        {
            id: "LOTE-2026-004",
            organizacaoId: "ORG003",
            notaFiscal: "NF-SEED-3001",
            transportadora: "Logística Verde",
            statusProcessamento: "ENCAMINHADO" as const,
            observacoes: "Materiais encaminhados para reaproveitamento.",
            dias: -75,
            triagemConcluidaEm: new Date("2026-09-18T12:00:00.000Z"),
            triagemResponsavelId: "10000000-0000-4000-8000-000000000003"
        },
        {
            id: "LOTE-2026-005",
            organizacaoId: "ORG002",
            notaFiscal: "NF-SEED-2002",
            transportadora: "TransEco",
            statusProcessamento: "FINALIZADO" as const,
            observacoes: "Processamento finalizado.",
            dias: -45,
            triagemConcluidaEm: new Date("2026-10-22T12:00:00.000Z"),
            triagemResponsavelId: "10000000-0000-4000-8000-000000000002"
        },
        {
            id: "LOTE-2026-006",
            organizacaoId: "ORG004",
            notaFiscal: "NF-SEED-4001",
            transportadora: "Entrega Certa",
            statusProcessamento: "CANCELADO" as const,
            observacoes: "Lote cancelado para teste de relatórios.",
            dias: -60,
            triagemConcluidaEm: null,
            triagemResponsavelId: null
        }
    ];

    for (const lote of lotes) {
        await prisma.lote.upsert({
            where: { id: lote.id },
            update: {
                organizacaoId: lote.organizacaoId,
                notaFiscal: lote.notaFiscal,
                transportadora: lote.transportadora,
                statusProcessamento: lote.statusProcessamento,
                observacoes: lote.observacoes,
                dataEntrada: diasAPartirDeHoje(lote.dias),
                ...(lote.triagemConcluidaEm && {
                    triagemConcluidaEm: lote.triagemConcluidaEm
                }),
                ...(lote.triagemResponsavelId && {
                    triagemResponsavelId: lote.triagemResponsavelId
                })
            },
            create: {
                id: lote.id,
                organizacaoId: lote.organizacaoId,
                notaFiscal: lote.notaFiscal,
                transportadora: lote.transportadora,
                statusProcessamento: lote.statusProcessamento,
                observacoes: lote.observacoes,
                dataEntrada: diasAPartirDeHoje(lote.dias),
                ...(lote.triagemConcluidaEm && {
                    triagemConcluidaEm: lote.triagemConcluidaEm
                }),
                ...(lote.triagemResponsavelId && {
                    triagemResponsavelId: lote.triagemResponsavelId
                })
            }
        });
    }

    const equipamentos = [
        {
            codigoBarrasInterno: "PC-26-000001",
            tipo: "COMPUTADOR_MESA" as const,
            marca: "Dell",
            modelo: "OptiPlex 7090",
            anoFabricacao: 2021,
            estadoFisico: "BOM_ESTADO" as const,
            pesoQuilogramas: 7.8,
            loteId: "LOTE-2026-001",
            posicaoNoLote: 1,
            statusRastreamento: "AGUARDANDO_TRIAGEM" as const
        },
        {
            codigoBarrasInterno: "NT-26-000002",
            tipo: "NOTEBOOK" as const,
            marca: "Lenovo",
            modelo: "ThinkPad T14",
            anoFabricacao: 2022,
            estadoFisico: "USADO_LEVE" as const,
            pesoQuilogramas: 1.5,
            loteId: "LOTE-2026-001",
            posicaoNoLote: 2,
            statusRastreamento: "AGUARDANDO_TRIAGEM" as const
        },
        {
            codigoBarrasInterno: "MN-26-000003",
            tipo: "MONITOR" as const,
            marca: "Samsung",
            modelo: "S24R350",
            anoFabricacao: 2020,
            estadoFisico: "USADO_MODERADO" as const,
            pesoQuilogramas: 3.2,
            loteId: "LOTE-2026-002",
            posicaoNoLote: 1,
            statusRastreamento: "EM_TRIAGEM" as const
        },
        {
            codigoBarrasInterno: "SV-26-000004",
            tipo: "SERVIDOR" as const,
            marca: "HPE",
            modelo: "ProLiant DL360",
            anoFabricacao: 2019,
            estadoFisico: "BOM_ESTADO" as const,
            pesoQuilogramas: 18.4,
            loteId: "LOTE-2026-003",
            posicaoNoLote: 1,
            statusRastreamento: "PECAS_REAPROVEITADAS" as const
        },
        {
            codigoBarrasInterno: "IM-26-000005",
            tipo: "IMPRESSORA" as const,
            marca: "HP",
            modelo: "LaserJet Pro",
            anoFabricacao: 2018,
            estadoFisico: "DANIFICADO_LEVE" as const,
            pesoQuilogramas: 6.1,
            loteId: "LOTE-2026-003",
            posicaoNoLote: 2,
            statusRastreamento: "MATERIAL_RECICLAVEL" as const
        },
        {
            codigoBarrasInterno: "RT-26-000006",
            tipo: "ROTEADOR" as const,
            marca: "Cisco",
            modelo: "RV340",
            anoFabricacao: 2020,
            estadoFisico: "USADO_LEVE" as const,
            pesoQuilogramas: 0.9,
            loteId: "LOTE-2026-004",
            posicaoNoLote: 1,
            statusRastreamento: "DESCARTE_SEGURO" as const
        },
        {
            codigoBarrasInterno: "FA-26-000007",
            tipo: "FONTE_ALIMENTACAO" as const,
            marca: "Corsair",
            modelo: "CX550",
            anoFabricacao: 2017,
            estadoFisico: "DANIFICADO_GRAVE" as const,
            pesoQuilogramas: 1.7,
            loteId: "LOTE-2026-005",
            posicaoNoLote: 1,
            statusRastreamento: "BAIXA_DEFINITIVA" as const
        },
        {
            codigoBarrasInterno: "CB-26-000008",
            tipo: "CABO_ESTRUTURADO" as const,
            marca: "Furukawa",
            modelo: "Cat6 10m",
            anoFabricacao: 2023,
            estadoFisico: "NOVO" as const,
            pesoQuilogramas: 0.3,
            loteId: "LOTE-2026-005",
            posicaoNoLote: 2,
            statusRastreamento: "PECAS_REAPROVEITADAS" as const
        },
        {
            codigoBarrasInterno: "PC-26-000009",
            tipo: "COMPUTADOR_MESA" as const,
            marca: "Positivo",
            modelo: "Master D3400",
            anoFabricacao: 2016,
            estadoFisico: "INSERVIVEL" as const,
            pesoQuilogramas: 8.6,
            loteId: "LOTE-2026-006",
            posicaoNoLote: 1,
            statusRastreamento: "DESCARTE_SEGURO" as const
        }
    ];

    for (const [indice, equipamento] of equipamentos.entries()) {
        const existente = await prisma.equipamento.upsert({
            where: {
                codigoBarrasInterno: equipamento.codigoBarrasInterno
            },
            update: equipamento,
            create: equipamento
        });

        const movimentoId =
            `30000000-0000-4000-8000-${String(indice + 1).padStart(12, "0")}`;

        await prisma.movimentacao.upsert({
            where: { id: movimentoId },
            update: {
                equipamentoId: existente.id,
                origem: "Recebimento",
                destino: equipamento.statusRastreamento,
                responsavel: "admin.seed",
                observacao: "Movimentação de demonstração criada pelo seed.",
                dataHora: diasAPartirDeHoje(-Math.min(indice + 1, 30))
            },
            create: {
                id: movimentoId,
                equipamentoId: existente.id,
                origem: "Recebimento",
                destino: equipamento.statusRastreamento,
                responsavel: "admin.seed",
                observacao: "Movimentação de demonstração criada pelo seed.",
                dataHora: diasAPartirDeHoje(-Math.min(indice + 1, 30))
            }
        });
    }

    const equipamentosPorCodigo = await prisma.equipamento.findMany({
        where: {
            codigoBarrasInterno: {
                in: [
                    "PC-26-000001",
                    "NT-26-000002",
                    "MN-26-000003",
                    "SV-26-000004",
                    "IM-26-000005",
                    "RT-26-000006"
                ]
            }
        },
        select: {
            id: true,
            codigoBarrasInterno: true
        }
    });

    function obterEquipamentoId(codigoBarrasInterno: string): string {
        const equipamento = equipamentosPorCodigo.find(
            (item) => item.codigoBarrasInterno === codigoBarrasInterno
        );

        if (!equipamento) {
            throw new Error(`Equipamento ${codigoBarrasInterno} não encontrado para o seed analítico.`);
        }

        return equipamento.id;
    }

    const recuperacoes = [
        {
            id: "50000000-0000-4000-8000-000000000001",
            codigo: "PC-26-000001",
            valor: "450.00",
            data: "2026-08-20T12:00:00.000Z",
            observacao: "Recuperação de placa e memória."
        },
        {
            id: "50000000-0000-4000-8000-000000000002",
            codigo: "NT-26-000002",
            valor: "720.50",
            data: "2026-09-12T12:00:00.000Z",
            observacao: "Substituição de tela e bateria."
        },
        {
            id: "50000000-0000-4000-8000-000000000003",
            codigo: "SV-26-000004",
            valor: "1850.00",
            data: "2026-10-05T12:00:00.000Z",
            observacao: "Recuperação de fontes redundantes."
        },
        {
            id: "50000000-0000-4000-8000-000000000004",
            codigo: "RT-26-000006",
            valor: "95.75",
            data: "2026-11-02T12:00:00.000Z",
            observacao: "Reparo de conectores e firmware."
        },
        {
            id: "50000000-0000-4000-8000-000000000005",
            codigo: "IM-26-000005",
            valor: "210.00",
            data: "2026-10-18T12:00:00.000Z",
            observacao: "Recuperação do conjunto de alimentação."
        }
    ];

    for (const recuperacao of recuperacoes) {
        const equipamentoId = obterEquipamentoId(recuperacao.codigo);

        await prisma.registroRecuperacao.upsert({
            where: { id: recuperacao.id },
            update: {
                equipamentoId,
                valorRecuperacao: recuperacao.valor,
                registradoEm: new Date(recuperacao.data),
                observacao: recuperacao.observacao
            },
            create: {
                id: recuperacao.id,
                equipamentoId,
                valorRecuperacao: recuperacao.valor,
                registradoEm: new Date(recuperacao.data),
                observacao: recuperacao.observacao
            }
        });
    }

    const seriesCondicao: {
        codigo: string;
        observacoes: [string, number, boolean, string][];
    }[] = [
        {
            codigo: "PC-26-000001",
            observacoes: [
                ["2026-07-01T12:00:00.000Z", 96, false, "Condição inicial estável."],
                ["2026-08-01T12:00:00.000Z", 88, false, "Desgaste leve identificado."],
                ["2026-09-01T12:00:00.000Z", 76, true, "Falha intermitente na memória."],
                ["2026-10-01T12:00:00.000Z", 63, true, "Falha recorrente registrada."]
            ]
        },
        {
            codigo: "NT-26-000002",
            observacoes: [
                ["2026-07-05T12:00:00.000Z", 92, false, "Condição geral boa."],
                ["2026-08-05T12:00:00.000Z", 84, false, "Bateria com autonomia reduzida."],
                ["2026-09-05T12:00:00.000Z", 71, true, "Falha na dobradiça identificada."],
                ["2026-10-05T12:00:00.000Z", 58, true, "Trinca estrutural evoluiu."]
            ]
        }
    ];

    let indiceObservacao = 1;
    for (const serie of seriesCondicao) {
        const equipamentoId = obterEquipamentoId(serie.codigo);

        for (const [data, indice, falha, observacao] of serie.observacoes) {
            const id = `60000000-0000-4000-8000-${String(indiceObservacao).padStart(12, "0")}`;
            await prisma.observacaoCondicaoEquipamento.upsert({
                where: { id },
                update: {
                    equipamentoId,
                    observadoEm: new Date(data),
                    indiceCondicao: indice,
                    falhaRegistrada: falha,
                    observacao
                },
                create: {
                    id,
                    equipamentoId,
                    observadoEm: new Date(data),
                    indiceCondicao: indice,
                    falhaRegistrada: falha,
                    observacao
                }
            });
            indiceObservacao += 1;
        }
    }

    await prisma.configuracao.upsert({
        where: { id: 1 },
        update: {
            aliquotaImposto: 0.12,
            coeficienteDepreciacao: 0.18
        },
        create: {
            id: 1,
            aliquotaImposto: 0.12,
            coeficienteDepreciacao: 0.18
        }
    });

    const admin = await prisma.usuario.findUnique({
        where: { usuario: "admin.seed" }
    });

    if (admin) {
        const auditoria = [
            {
                id: "40000000-0000-4000-8000-000000000001",
                acao: "SEED_CRIADO",
                entidade: "Organizacao",
                entidadeId: "ORG001",
                detalhes: { origem: "seed:dados" }
            },
            {
                id: "40000000-0000-4000-8000-000000000002",
                acao: "SEED_CRIADO",
                entidade: "Lote",
                entidadeId: "LOTE-2026-001",
                detalhes: { origem: "seed:dados" }
            },
            {
                id: "40000000-0000-4000-8000-000000000003",
                acao: "SEED_CRIADO",
                entidade: "Configuracao",
                entidadeId: "1",
                detalhes: {
                    aliquotaImposto: 0.12,
                    coeficienteDepreciacao: 0.18
                }
            }
        ];

        for (const registro of auditoria) {
            await prisma.registroAuditoria.upsert({
                where: { id: registro.id },
                update: {
                    usuarioId: admin.id,
                    ...registro
                },
                create: {
                    usuarioId: admin.id,
                    ...registro
                }
            });
        }
    }

    console.log("Seed de dados concluído com sucesso.");
    console.log(
        "Entidades: usuários, organizações, contratos, lotes, equipamentos, movimentações, recuperações, observações de condição, configuração e auditoria."
    );
    console.log(
        "Logins de teste: admin.seed, operador.seed, gestor.seed, auditor.seed"
    );
    console.log("Senha dos usuários de teste: valor de ADM_SENHA no .env");
}

main()
    .catch((erro) => {
        console.error("Erro ao popular o banco de dados:", erro);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });