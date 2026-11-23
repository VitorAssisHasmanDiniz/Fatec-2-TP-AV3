import type { Request, Response, NextFunction } from "express";

export function middlewareVersaoApiPublica(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader("X-API-Version", "1");
    next();
}

export function marcarDepreciacao(dataSunset: string): (req: Request, res: Response, next: NextFunction) => void {
    return (_req: Request, res: Response, next: NextFunction): void => {
        res.setHeader("Deprecation", "true");
        res.setHeader("Sunset", dataSunset);
        next();
    };
}
