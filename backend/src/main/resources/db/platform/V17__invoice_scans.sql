-- Decisión 295: XASKA IA, adicional pagado (la función de plan AI, que ningún plan trae: se da como extra).
--   * ai_allowances: tope al mes de cada función de XASKA IA, igual para todos los negocios que lo tienen; se cambia
--     en la consola. Hoy: facturas de compra leídas con foto o PDF.
--   * subscriptions.extra_invoice_scans: facturas con IA de más que el administrador le da a un negocio.
CREATE TABLE platform.ai_allowances (
    code          VARCHAR(30) PRIMARY KEY,
    name          VARCHAR(80) NOT NULL,
    monthly_limit INTEGER     NOT NULL CHECK (monthly_limit BETWEEN 0 AND 100000),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform.ai_allowances (code, name, monthly_limit) VALUES
    ('INVOICE_SCANS', 'Facturas de compra leídas con foto o PDF', 100);

ALTER TABLE platform.subscriptions ADD COLUMN extra_invoice_scans INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_subscriptions_extra_invoice_scans CHECK (extra_invoice_scans BETWEEN 0 AND 10000);
