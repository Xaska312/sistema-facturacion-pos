-- Decisión 325: los recibos de gastos leídos con Aska cuentan en el mismo registro de XASKA IA, con su propio tope.
ALTER TABLE ai_questions DROP CONSTRAINT IF EXISTS ck_ai_questions_kind;
ALTER TABLE ai_questions ADD CONSTRAINT ck_ai_questions_kind
    CHECK (kind IN ('QUESTION', 'PURCHASE_REVIEW', 'CATALOG_READ', 'EXPENSE_READ'));
