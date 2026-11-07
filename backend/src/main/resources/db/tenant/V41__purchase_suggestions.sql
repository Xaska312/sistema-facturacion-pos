-- Decisión 297: "Qué comprar".
--   * supplier_order_settings: para cuántos días de venta se le pide a cada proveedor (15 si no tiene).
--   * ai_questions.kind: el mismo registro de XASKA IA cuenta las preguntas (QUESTION) y las revisiones de pedidos
--     (PURCHASE_REVIEW), cada una con su tope.
CREATE TABLE supplier_order_settings (
    supplier_id    UUID         PRIMARY KEY REFERENCES suppliers (party_id),
    coverage_days  INTEGER      NOT NULL CHECK (coverage_days BETWEEN 1 AND 120),
    updated_at     TIMESTAMPTZ  NOT NULL,
    updated_by     UUID         NOT NULL
);

ALTER TABLE ai_questions ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'QUESTION'
    CHECK (kind IN ('QUESTION', 'PURCHASE_REVIEW'));
DROP INDEX ix_ai_questions_created;
CREATE INDEX ix_ai_questions_kind_created ON ai_questions (kind, created_at) WHERE status = 'OK';
