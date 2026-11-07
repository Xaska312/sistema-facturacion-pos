-- Decisión 302: Planes y pagos con Bre-B. El negocio arma su pedido (plan, XASKA IA, módulos y cupos), paga a la
-- llave Bre-B de XASKA con una referencia, sube el comprobante, Aska lo revisa y el administrador lo aprueba.

-- Lo que se vende aparte del plan, con su precio al mes (nulo = no se vende). Lo edita el administrador.
CREATE TABLE platform.addons (
    code          VARCHAR(30)    PRIMARY KEY,
    kind          VARCHAR(10)    NOT NULL,
    ref           VARCHAR(30),
    name          VARCHAR(60)    NOT NULL,
    description   VARCHAR(200)   NOT NULL DEFAULT '',
    monthly_price NUMERIC(14, 2),
    active        BOOLEAN        NOT NULL DEFAULT TRUE,
    sort_order    INTEGER        NOT NULL,
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT ck_addons_kind CHECK (kind IN ('FEATURE', 'MODULE', 'BRANCH', 'REGISTER', 'USER')),
    CONSTRAINT ck_addons_ref CHECK ((kind IN ('FEATURE', 'MODULE')) = (ref IS NOT NULL)),
    CONSTRAINT ck_addons_price CHECK (monthly_price IS NULL OR monthly_price >= 0)
);

INSERT INTO platform.addons (code, kind, ref, name, description, monthly_price, sort_order) VALUES
    ('AI', 'FEATURE', 'AI', 'XASKA IA', 'Aska lee facturas y listas de precios, responde sobre tu negocio, te dice qué comprar y te manda el resumen del día.', 39900, 1),
    ('PURCHASES', 'FEATURE', 'PURCHASES', 'Compras y proveedores', 'Recibir mercancía, cuentas por pagar y Qué comprar.', 14900, 10),
    ('DIRECT_PRINT', 'FEATURE', 'DIRECT_PRINT', 'Impresión directa', 'Imprime recibos y abre el cajón sin diálogo con XASKA Impresora.', 9900, 11),
    ('AUDIT', 'FEATURE', 'AUDIT', 'Auditoría', 'Quién hizo qué y cuándo.', 9900, 12),
    ('TRANSFERS', 'FEATURE', 'TRANSFERS', 'Traslados entre sedes', 'Mueve mercancía de una sede a otra.', 9900, 13),
    ('ORDERS', 'MODULE', 'ORDERS', 'Pedidos por encargo', 'Pedidos con abono y entrega.', 9900, 20),
    ('QUOTES', 'MODULE', 'QUOTES', 'Cotizaciones', 'Cotiza y conviértela en venta.', 9900, 21),
    ('VARIANTS', 'MODULE', 'VARIANTS', 'Tallas y colores', 'Productos con tallas y colores.', 9900, 22),
    ('SCALE', 'MODULE', 'SCALE', 'Báscula', 'Etiquetas de peso y PLU.', 9900, 23),
    ('MODIFIERS', 'MODULE', 'MODIFIERS', 'Adiciones', 'Tamaños, extras y notas por producto.', 9900, 24),
    ('TABLES', 'MODULE', 'TABLES', 'Mesas', 'Cuentas abiertas por mesa, para llevar y domicilio.', 14900, 25),
    ('KITCHEN', 'MODULE', 'KITCHEN', 'Cocina y comandas', 'Envía lo pedido a cocina. Necesita Mesas.', 9900, 26),
    ('MEDICINES', 'MODULE', 'MEDICINES', 'Droguería', 'Ficha del medicamento, CUM y dispensación.', 14900, 27),
    ('EXTRA_BRANCH', 'BRANCH', NULL, 'Sede adicional', 'Una sede más.', 29900, 40),
    ('EXTRA_REGISTER', 'REGISTER', NULL, 'Caja adicional', 'Una caja más.', 9900, 41),
    ('EXTRA_USER', 'USER', NULL, 'Usuario adicional', 'Una persona más en el equipo.', 4900, 42);

-- Lo que cada negocio compró aparte, con su propio vencimiento. trial = prueba gratis de XASKA IA.
CREATE TABLE platform.subscription_addons (
    tenant_id   UUID          NOT NULL REFERENCES platform.tenants (id),
    addon_code  VARCHAR(30)   NOT NULL REFERENCES platform.addons (code),
    quantity    INTEGER       NOT NULL DEFAULT 1,
    ends_at     TIMESTAMPTZ   NOT NULL,
    trial       BOOLEAN       NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ   NOT NULL,
    PRIMARY KEY (tenant_id, addon_code),
    CONSTRAINT ck_subscription_addons_quantity CHECK (quantity BETWEEN 1 AND 100)
);

-- La prueba gratis de XASKA IA es una sola vez por negocio, con topes más bajos.
ALTER TABLE platform.subscriptions ADD COLUMN ai_trial_used_at TIMESTAMPTZ;
ALTER TABLE platform.ai_allowances ADD COLUMN trial_limit INTEGER NOT NULL DEFAULT 0;
UPDATE platform.ai_allowances SET trial_limit = CASE code
    WHEN 'INVOICE_SCANS' THEN 10 WHEN 'QUESTIONS' THEN 40 WHEN 'PURCHASE_REVIEWS' THEN 5
    WHEN 'DAILY_DIGESTS' THEN 14 WHEN 'CATALOG_READS' THEN 2 ELSE 0 END;

-- Datos para pagar por Bre-B (una sola fila).
CREATE TABLE platform.billing_settings (
    id            INTEGER       PRIMARY KEY DEFAULT 1,
    breb_key      VARCHAR(64)   NOT NULL DEFAULT '',
    holder_name   VARCHAR(120)  NOT NULL DEFAULT '',
    bank_name     VARCHAR(60)   NOT NULL DEFAULT '',
    notes         VARCHAR(300)  NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT ck_billing_settings_single CHECK (id = 1)
);
INSERT INTO platform.billing_settings (id) VALUES (1);

-- Cada pedido de pago: lo que se compra, el valor, la referencia y el comprobante con la revisión de Aska.
CREATE TABLE platform.payment_requests (
    id              UUID           PRIMARY KEY,
    tenant_id       UUID           NOT NULL REFERENCES platform.tenants (id),
    reference       VARCHAR(12)    NOT NULL UNIQUE,
    plan_code       VARCHAR(20)    REFERENCES platform.plans (code),
    billing_cycle   VARCHAR(10)    NOT NULL,
    periods         INTEGER        NOT NULL,
    plan_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0,
    items           TEXT           NOT NULL,
    amount          NUMERIC(14, 2) NOT NULL,
    status          VARCHAR(12)    NOT NULL,
    proof           BYTEA,
    proof_type      VARCHAR(60),
    proof_at        TIMESTAMPTZ,
    ai_check        TEXT,
    reject_reason   VARCHAR(300),
    created_by      UUID           NOT NULL REFERENCES platform.users (id),
    created_at      TIMESTAMPTZ    NOT NULL,
    expires_at      TIMESTAMPTZ    NOT NULL,
    reviewed_by     UUID           REFERENCES platform.users (id),
    reviewed_at     TIMESTAMPTZ,
    CONSTRAINT ck_payment_requests_status CHECK (status IN ('PENDING', 'SENT', 'APPROVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT ck_payment_requests_cycle CHECK (billing_cycle IN ('MONTHLY', 'ANNUAL')),
    CONSTRAINT ck_payment_requests_periods CHECK (periods BETWEEN 1 AND 36),
    CONSTRAINT ck_payment_requests_amount CHECK (amount > 0)
);
CREATE INDEX ix_payment_requests_tenant ON platform.payment_requests (tenant_id, created_at DESC);
CREATE INDEX ix_payment_requests_status ON platform.payment_requests (status, proof_at);
