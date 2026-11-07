-- Decisión 300: las listas de precios leídas con Aska cuentan en el mismo registro de XASKA IA, con su propio tope.
ALTER TABLE ai_questions DROP CONSTRAINT IF EXISTS ai_questions_kind_check;
ALTER TABLE ai_questions ADD CONSTRAINT ck_ai_questions_kind
    CHECK (kind IN ('QUESTION', 'PURCHASE_REVIEW', 'CATALOG_READ'));
