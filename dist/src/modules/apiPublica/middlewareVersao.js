export const VERSAO_API_PUBLICA = "1.0.0";
export function middlewareVersaoApiPublica(_req, res, next) {
    res.setHeader("X-API-Version", VERSAO_API_PUBLICA);
    next();
}
export function marcarDepreciacao(dataSunset, urlSucessora) {
    return (_req, res, next) => {
        res.setHeader("Deprecation", "true");
        res.setHeader("Sunset", dataSunset);
        if (urlSucessora) {
            res.setHeader("Link", `<${urlSucessora}>; rel="successor-version"`);
        }
        next();
    };
}
