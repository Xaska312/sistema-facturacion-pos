-- Decisión 295: lecturas de facturas con IA por mes, según el plan (nulo = sin límite, 0 = no incluye), más las que el
-- administrador le dé a un negocio como extra. Los planes anteriores (Básico y Pro) conservan "todo": como Negocio y
-- Empresa.
ALTER TABLE platform.plans ADD COLUMN max_invoice_scans INTEGER,
    ADD CONSTRAINT ck_plans_invoice_scans CHECK (max_invoice_scans IS NULL OR max_invoice_scans >= 0);
UPDATE platform.plans SET max_invoice_scans = CASE code
    WHEN 'EMPRENDE' THEN 0 WHEN 'NEGOCIO' THEN 40 WHEN 'BASIC' THEN 40 ELSE 150 END, updated_at = now();

ALTER TABLE platform.subscriptions ADD COLUMN extra_invoice_scans INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_subscriptions_extra_invoice_scans CHECK (extra_invoice_scans BETWEEN 0 AND 10000);
