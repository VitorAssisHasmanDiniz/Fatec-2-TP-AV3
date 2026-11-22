WITH auditorias_recentes AS (
    SELECT DISTINCT ON (ra."entidadeId")
        ra."entidadeId",
        ra."criadoEm",
        ra."usuarioId"
    FROM "registros_auditoria" AS ra
    WHERE ra."acao" = 'TRIAGEM_CONCLUIDA'
      AND ra."entidade" = 'Lote'
      AND ra."entidadeId" IS NOT NULL
    ORDER BY ra."entidadeId", ra."criadoEm" DESC, ra."id" DESC
)
UPDATE "lotes" AS lote
SET
    "triagemConcluidaEm" = auditoria."criadoEm",
    "triagemResponsavelId" = auditoria."usuarioId"
FROM auditorias_recentes AS auditoria
WHERE auditoria."entidadeId" = lote."id"
  AND lote."statusProcessamento" IN ('TRIAGEM_CONCLUIDA', 'ENCAMINHADO', 'FINALIZADO')
  AND lote."triagemConcluidaEm" IS NULL;
