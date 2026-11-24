import type { Request, Response, NextFunction } from "express";

export const VERSAO_API_PUBLICA = "1.0.0";

export function middlewareVersaoApiPublica(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader("X-API-Version", VERSAO_API_PUBLICA);
    next();
}

export function marcarDepreciacao(
    dataSunset: string,
    urlSucessora?: string,
): (req: Request, res: Response, next: NextFunction) => void {
    return (_req: Request, res: Response, next: NextFunction): void => {
        res.setHeader("Deprecation", "true");
        res.setHeader("Sunset", dataSunset);
        if (urlSucessora) {
            res.setHeader("Link", `<${urlSucessora}>; rel="successor-version"`);
        }
        next();
    };
}
