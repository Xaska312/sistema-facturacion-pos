-- =====================================================================
-- Fase 10b: pedidos por encargo (decisión 258; empresa de mármoles y granito, tortas de panadería).
-- - Un pedido es un compromiso con un cliente: líneas por pieza o por medidas (ancho × largo = m²), fecha de entrega,
--   dirección e indicaciones opcionales. No es una venta: no mueve inventario ni ingresos.
-- - Los anticipos entran a la caja el día que se reciben (ORDER_PAYMENT) y quedan en order_payments (libro
--   inmutable). Al entregar (todo o parte) se registra una venta normal con las líneas entregadas; lo anticipado se
--   aplica con el medio de pago "Anticipo" (DEPOSIT, no entra al efectivo) y el resto se cobra como en el POS.
-- - Cancelar devuelve lo anticipado que no se aplicó (ORDER_REFUND si fue en efectivo).
-- =====================================================================

INSERT INTO permissions (code, module, description) VALUES
    ('orders:read',   'orders', 'Ver los pedidos por encargo'),
    ('orders:create', 'orders', 'Crear y editar pedidos, recibir anticipos y entregar'),
    ('orders:manage', 'orders', 'Cancelar pedidos y devolver anticipos');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
CROSS JOIN (VALUES ('orders:read'), ('orders:create'), ('orders:manage')) AS p (code)
WHERE r.system_role AND r.code IN ('OWNER', 'ADMIN')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
CROSS JOIN (VALUES ('orders:read'), ('orders:create')) AS p (code)
WHERE r.system_role AND r.code IN ('CASHIER', 'SELLER')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'orders:read' FROM roles r
WHERE r.system_role AND r.code = 'ACCOUNTANT'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'orders:read');

-- Metro cuadrado (mesones, enchapes, vidrios…), si el negocio no lo creó ya.
INSERT INTO units (id, code, name, allows_decimals, created_at, updated_at, version)
SELECT '01920000-0000-7000-8000-000000000311', 'M2', 'Metro cuadrado', TRUE, now(), now(), 0
WHERE NOT EXISTS (SELECT 1 FROM units WHERE code = 'M2')
  AND NOT EXISTS (SELECT 1 FROM units WHERE id = '01920000-0000-7000-8000-000000000311');

-- Medio de pago "Anticipo": lo ya abonado a un pedido que se aplica al entregarlo. Solo lo usa la entrega de pedidos.
INSERT INTO payment_methods (id, code, name, affects_cash, requires_reference, sort_order)
SELECT '01920000-0000-7000-8000-000000000705', 'DEPOSIT', 'Anticipo', FALSE, FALSE, 5
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE code = 'DEPOSIT')
  AND NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = '01920000-0000-7000-8000-000000000705');

INSERT INTO document_sequences (code, prefix, next_number) VALUES ('ORDER', 'PED', 1)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_type;
ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_sign;
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_type CHECK (type IN
    ('SALE', 'SALE_VOID', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT', 'CREDIT_PAYMENT_VOID',
     'ORDER_PAYMENT', 'ORDER_REFUND'));
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_sign CHECK (
    (type IN ('SALE', 'INCOME', 'CREDIT_PAYMENT', 'ORDER_PAYMENT') AND amount > 0)
    OR (type IN ('SALE_VOID', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT_VOID', 'ORDER_REFUND') AND amount < 0));

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    id                UUID          PRIMARY KEY,
    prefix            VARCHAR(10)   NOT NULL,
    number            BIGINT        NOT NULL,
    status            VARCHAR(12)   NOT NULL,
    customer_id       UUID          NOT NULL REFERENCES customers (party_id),
    due_date          DATE          NOT NULL,
    address           VARCHAR(255),
    notes             VARCHAR(1000),
    total             NUMERIC(14,2) NOT NULL,
    created_by        UUID          NOT NULL,
    created_at        TIMESTAMPTZ   NOT NULL,
    updated_by        UUID,
    updated_at        TIMESTAMPTZ   NOT NULL,
    delivered_at      TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    cancelled_by      UUID,
    cancel_reason     VARCHAR(255),
    version           BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT uq_orders_number UNIQUE (prefix, number),
    CONSTRAINT ck_orders_status CHECK (status IN ('OPEN', 'DELIVERED', 'CANCELLED')),
    CONSTRAINT ck_orders_total CHECK (total >= 0),
    CONSTRAINT ck_orders_cancel CHECK (
        (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)
        OR (status <> 'CANCELLED' AND cancelled_at IS NULL))
);

CREATE INDEX ix_orders_open_due ON orders (due_date) WHERE status = 'OPEN';
CREATE INDEX ix_orders_customer ON orders (customer_id);
CREATE INDEX ix_orders_created ON orders (created_at DESC);

CREATE TABLE order_items (
    id                UUID          PRIMARY KEY,
    order_id          UUID          NOT NULL REFERENCES orders (id),
    line_no           INTEGER       NOT NULL,
    product_id        UUID          NOT NULL REFERENCES products (id),
    description       VARCHAR(200),
    width             NUMERIC(10,3),
    length            NUMERIC(10,3),
    quantity          NUMERIC(14,4) NOT NULL,
    unit_price        NUMERIC(14,2) NOT NULL,
    total             NUMERIC(14,2) NOT NULL,
    sale_id           UUID          REFERENCES sales (id),
    delivered_at      TIMESTAMPTZ,
    CONSTRAINT uq_order_items_line UNIQUE (order_id, line_no),
    CONSTRAINT ck_order_items_amounts CHECK (quantity > 0 AND unit_price > 0 AND total >= 0),
    CONSTRAINT ck_order_items_size CHECK ((width IS NULL) = (length IS NULL) AND (width IS NULL OR (width > 0 AND length > 0))),
    CONSTRAINT ck_order_items_delivery CHECK ((sale_id IS NULL) = (delivered_at IS NULL))
);

CREATE INDEX ix_order_items_order ON order_items (order_id, line_no);
CREATE INDEX ix_order_items_sale ON order_items (sale_id) WHERE sale_id IS NOT NULL;

-- Anticipos (+), devoluciones (−), lo aplicado al entregar (−) y su reversa si se anula la venta (+).
CREATE TABLE order_payments (
    id                 UUID          PRIMARY KEY,
    entry_no           BIGINT        GENERATED ALWAYS AS IDENTITY,
    order_id           UUID          NOT NULL REFERENCES orders (id),
    type               VARCHAR(20)   NOT NULL,
    amount             NUMERIC(14,2) NOT NULL,
    payment_method_id  UUID          REFERENCES payment_methods (id),
    method_code        VARCHAR(20),
    reference          VARCHAR(60),
    notes              VARCHAR(255),
    cash_session_id    UUID          REFERENCES cash_sessions (id),
    sale_id            UUID          REFERENCES sales (id),
    idempotency_key    VARCHAR(100),
    created_by         UUID,
    created_at         TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_order_payments_type CHECK (type IN ('DEPOSIT', 'REFUND', 'APPLIED', 'APPLIED_VOID')),
    CONSTRAINT ck_order_payments_sign CHECK (
        (type IN ('DEPOSIT', 'APPLIED_VOID') AND amount > 0) OR (type IN ('REFUND', 'APPLIED') AND amount < 0)),
    CONSTRAINT ck_order_payments_links CHECK (
        (type IN ('DEPOSIT', 'REFUND') AND payment_method_id IS NOT NULL AND sale_id IS NULL)
        OR (type IN ('APPLIED', 'APPLIED_VOID') AND sale_id IS NOT NULL)),
    CONSTRAINT uq_order_payments_idempotency UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX uq_order_payments_entry ON order_payments (entry_no);
CREATE INDEX ix_order_payments_order ON order_payments (order_id, entry_no);
CREATE UNIQUE INDEX uq_order_payments_applied ON order_payments (sale_id) WHERE type = 'APPLIED';
CREATE UNIQUE INDEX uq_order_payments_applied_void ON order_payments (sale_id) WHERE type = 'APPLIED_VOID';

CREATE TRIGGER trg_order_payments_immutable
    BEFORE UPDATE OR DELETE ON order_payments
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_order_payments_no_truncate BEFORE TRUNCATE ON order_payments
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
