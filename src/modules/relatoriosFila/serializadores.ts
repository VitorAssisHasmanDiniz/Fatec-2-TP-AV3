function normalizarValor(valor: unknown): string {
    if (valor === null || valor === undefined) {
        return "";
    }

    if (valor instanceof Date) {
        return valor.toISOString();
    }

    if (typeof valor === "object") {
        return JSON.stringify(valor);
    }

    return String(valor);
}

function escaparCampoCsv(valor: unknown): string {
    const texto = normalizarValor(valor);
    return `"${texto.replace(/"/g, '""')}"`;
}

function obterRegistros(resultado: unknown): Record<string, unknown>[] {
    if (typeof resultado !== "object" || resultado === null) {
        throw new Error("O resultado analítico deve ser um objeto.");
    }

    const resultados = (resultado as Record<string, unknown>).resultados;

    if (!Array.isArray(resultados)) {
        throw new Error("O resultado analítico não contém uma lista de resultados.");
    }

    return resultados.map((registro): Record<string, unknown> => {
        if (typeof registro !== "object" || registro === null || Array.isArray(registro)) {
            throw new Error("Foi encontrado um registro analítico inválido.");
        }

        return registro as Record<string, unknown>;
    });
}

export async function* serializarJson(resultado: unknown): AsyncGenerator<string> {
    if (typeof resultado !== "object" || resultado === null || Array.isArray(resultado)) {
        throw new Error("O resultado analítico deve ser um objeto.");
    }

    const objeto = resultado as Record<string, unknown>;
    const chaves = Object.keys(objeto);
    yield "{";

    for (let indice = 0; indice < chaves.length; indice += 1) {
        const chave = chaves[indice];

        if (chave === undefined) {
            continue;
        }

        yield `${indice > 0 ? "," : ""}${JSON.stringify(chave)}:`;

        if (chave !== "resultados") {
            yield JSON.stringify(objeto[chave] ?? null) ?? "null";
            continue;
        }

        const registros = obterRegistros(resultado);
        yield "[";

        for (let indiceRegistro = 0; indiceRegistro < registros.length; indiceRegistro += 1) {
            const registro = registros[indiceRegistro];
            yield `${indiceRegistro > 0 ? "," : ""}${JSON.stringify(registro)}`;
        }

        yield "]";
    }

    yield "}";
}

export async function* serializarCsv(resultado: unknown): AsyncGenerator<string> {
    if (typeof resultado !== "object" || resultado === null || Array.isArray(resultado)) {
        throw new Error("O resultado analítico deve ser um objeto.");
    }

    const objeto = resultado as Record<string, unknown>;
    const registros = obterRegistros(resultado);
    const colunas = registros.length > 0
        ? Object.keys(registros[0] ?? {})
        : ["semResultados"];

    yield `${colunas.map(escaparCampoCsv).join(",")}\r\n`;

    for (const registro of registros) {
        yield `${colunas.map((coluna) => escaparCampoCsv(registro[coluna])).join(",")}\r\n`;
    }

    const resumo = objeto.resumo;
    if (typeof resumo === "object" && resumo !== null && !Array.isArray(resumo)) {
        const camposResumo = Object.entries(resumo as Record<string, unknown>);
        if (camposResumo.length > 0) {
            yield "\r\n";
            yield `${escaparCampoCsv("resumo")},${escaparCampoCsv("valor")}\r\n`;
            for (const [campo, valor] of camposResumo) {
                yield `${escaparCampoCsv(campo)},${escaparCampoCsv(valor)}\r\n`;
            }
        }
    }
}
