const PREFIXOS_INJECAO_CSV = /^[ \t\r\n]*[=+\-@]/;
function normalizarValor(valor) {
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
function neutralizarInjecaoCsv(texto) {
    if (PREFIXOS_INJECAO_CSV.test(texto)) {
        return `'${texto}`;
    }
    return texto;
}
function serializarValorBruto(valor) {
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
function escaparCampoCsv(valor) {
    const bruto = serializarValorBruto(valor);
    const seguro = typeof valor === "string"
        ? neutralizarInjecaoCsv(bruto)
        : bruto;
    return `"${seguro.replace(/"/g, '""')}"`;
}
function obterRegistros(resultado) {
    if (typeof resultado !== "object" || resultado === null) {
        throw new Error("O resultado analítico deve ser um objeto.");
    }
    const resultados = resultado.resultados;
    if (!Array.isArray(resultados)) {
        throw new Error("O resultado analítico não contém uma lista de resultados.");
    }
    return resultados.map((registro) => {
        if (typeof registro !== "object" || registro === null || Array.isArray(registro)) {
            throw new Error("Foi encontrado um registro analítico inválido.");
        }
        return registro;
    });
}
export async function* serializarJson(resultado) {
    if (typeof resultado !== "object" || resultado === null || Array.isArray(resultado)) {
        throw new Error("O resultado analítico deve ser um objeto.");
    }
    const objeto = resultado;
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
export async function* serializarCsv(resultado) {
    if (typeof resultado !== "object" || resultado === null || Array.isArray(resultado)) {
        throw new Error("O resultado analítico deve ser um objeto.");
    }
    const objeto = resultado;
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
        const camposResumo = Object.entries(resumo);
        if (camposResumo.length > 0) {
            yield "\r\n";
            yield `${escaparCampoCsv("resumo")},${escaparCampoCsv("valor")}\r\n`;
            for (const [campo, valor] of camposResumo) {
                yield `${escaparCampoCsv(campo)},${escaparCampoCsv(valor)}\r\n`;
            }
        }
    }
}
