-- =====================================================================
-- Fase 10c: cotizaciones (decisión 260; marmolería, papelería, ventas al por mayor).
-- - Una cotización es una propuesta de precios para un cliente registrado o para un prospecto (nombre y teléfono).
--   No mueve inventario ni dinero. Vence en una fecha (por defecto, los días que diga Ajustes).
-- - Líneas como las de un pedido (por cantidad o por medidas ancho × largo) más un descuento por línea.
-- - Aceptada, se convierte en un pedido por encargo (decisión 258) o en una venta con los precios cotizados.
-- - Estado OPEN, ACCEPTED (convertida) o REJECTED; "vencida" = abierta con la fecha pasada (no se guarda).
-- =====================================================================

INSERT INTO permissions (code, module, description) VALUES
    ('quotes:read',   'quotes', 'Ver las cotizaciones'),
    ('quotes:create', 'quotes', 'Crear, editar, rechazar y convertir cotizaciones');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
CROSS JOIN (VALUES ('quotes:read'), ('quotes:create')) AS p (code)
WHERE r.system_role AND r.code IN ('OWNER', 'ADMIN', 'CASHIER', 'SELLER')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'quotes:read' FROM roles r
WHERE r.system_role AND r.code = 'ACCOUNTANT'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'quotes:read');

-- Las condiciones por defecto (quote_terms, en Ajustes) admiten hasta 1000 caracteres.
ALTER TABLE business_settings ALTER COLUMN setting_value TYPE VARCHAR(1000);

INSERT INTO document_sequences (code, prefix, next_number) VALUES ('QUOTE', 'COT', 1)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE quotes (
    id                UUID          PRIMARY KEY,
    prefix            VARCHAR(10)   NOT NULL,
    number            BIGINT        NOT NULL,
    status            VARCHAR(12)   NOT NULL,
    customer_id       UUID          REFERENCES customers (party_id),
    prospect_name     VARCHAR(160),
    prospect_phone    VARCHAR(30),
    valid_until       DATE          NOT NULL,
    notes             VARCHAR(1000),
    terms             VARCHAR(1000),
    total             NUMERIC(14,2) NOT NULL,
    created_by        UUID          NOT NULL,
    created_at        TIMESTAMPTZ   NOT NULL,
    updated_by        UUID,
    updated_at        TIMESTAMPTZ   NOT NULL,
    converted_type    VARCHAR(10),
    converted_id      UUID,
    converted_at      TIMESTAMPTZ,
    converted_by      UUID,
    rejected_at       TIMESTAMPTZ,
    rejected_by       UUID,
    reject_reason     VARCHAR(255),
    version           BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT uq_quotes_number UNIQUE (prefix, number),
    CONSTRAINT ck_quotes_status CHECK (status IN ('OPEN', 'ACCEPTED', 'REJECTED')),
    CONSTRAINT ck_quotes_total CHECK (total >= 0),
    CONSTRAINT ck_quotes_party CHECK (customer_id IS NOT NULL OR prospect_name IS NOT NULL),
    CONSTRAINT ck_quotes_converted CHECK (
        (status = 'ACCEPTED' AND converted_type IN ('ORDER', 'SALE') AND converted_id IS NOT NULL
             AND converted_at IS NOT NULL)
        OR (status <> 'ACCEPTED' AND converted_type IS NULL AND converted_id IS NULL)),
    CONSTRAINT ck_quotes_rejected CHECK (
        (status = 'REJECTED' AND rejected_at IS NOT NULL AND reject_reason IS NOT NULL)
        OR (status <> 'REJECTED' AND rejected_at IS NULL))
);

CREATE INDEX ix_quotes_open_valid ON quotes (valid_until) WHERE status = 'OPEN';
CREATE INDEX ix_quotes_customer ON quotes (customer_id);
CREATE INDEX ix_quotes_created ON quotes (created_at DESC);

CREATE TABLE quote_items (
    id                UUID          PRIMARY KEY,
    quote_id          UUID          NOT NULL REFERENCES quotes (id),
    line_no           INTEGER       NOT NULL,
    product_id        UUID          NOT NULL REFERENCES products (id),
    description       VARCHAR(200),
    width             NUMERIC(10,3),
    length            NUMERIC(10,3),
    quantity          NUMERIC(14,4) NOT NULL,
    unit_price        NUMERIC(14,2) NOT NULL,
    discount_percent  NUMERIC(5,2)  NOT NULL DEFAULT 0,
    total             NUMERIC(14,2) NOT NULL,
    CONSTRAINT uq_quote_items_line UNIQUE (quote_id, line_no),
    CONSTRAINT ck_quote_items_amounts CHECK (quantity > 0 AND unit_price > 0 AND total >= 0
        AND discount_percent >= 0 AND discount_percent <= 100),
    CONSTRAINT ck_quote_items_size CHECK ((width IS NULL) = (length IS NULL) AND (width IS NULL OR (width > 0 AND length > 0)))
);

CREATE INDEX ix_quote_items_quote ON quote_items (quote_id, line_no);
