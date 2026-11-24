import { basename, isAbsolute, resolve, sep } from "node:path";
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function obterDiretorioRelatorios(diretorioBase) {
    const configurado = (diretorioBase ?? process.env.REPORT_DIR)?.trim() || "storage/relatorios";
    return isAbsolute(configurado) ? resolve(configurado) : resolve(process.cwd(), configurado);
}
export function validarIdentificadorTarefa(tarefaId) {
    return REGEX_UUID.test(tarefaId);
}
export function resolverCaminhoSeguroRelatorio(caminhoArmazenado, diretorioBase) {
    const diretorio = obterDiretorioRelatorios(diretorioBase);
    const caminhoResolvido = isAbsolute(caminhoArmazenado)
        ? resolve(caminhoArmazenado)
        : resolve(diretorio, caminhoArmazenado);
    const prefixoPermitido = diretorio.endsWith(sep) ? diretorio : `${diretorio}${sep}`;
    if (!caminhoResolvido.startsWith(prefixoPermitido)) {
        throw new Error("Caminho de arquivo fora do diretório permitido de relatórios.");
    }
    return caminhoResolvido;
}
export function montarNomeDownloadRelatorio(tarefaId, formato) {
    if (!validarIdentificadorTarefa(tarefaId)) {
        throw new Error("Identificador de tarefa inválido para nome de arquivo.");
    }
    const extensao = formato.toLowerCase();
    return basename(`relatorio-${tarefaId}.${extensao}`);
}
