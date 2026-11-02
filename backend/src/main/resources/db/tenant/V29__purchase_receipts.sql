-- =====================================================================
-- Fase 13-2 (decisión 280): compras — recepción de mercancía contra la factura del proveedor y cuentas por pagar.
--   * Recepción técnica y administrativa (Resolución 1403 de 2007; lo pide la visita de la Secretaría de Salud):
--     proveedor, factura, quién recibió, revisión de empaque, etiquetas y registro sanitario, temperatura de llegada de
--     lo que va en nevera, y por línea lote, vencimiento, cantidad, costo y si se aceptó o se rechazó (con motivo).
--   * Lo aceptado entra al inventario como compra (PURCHASE) y recalcula el costo promedio; lo rechazado queda
--     registrado sin mover existencias. El total por pagar es el de lo aceptado.
--   * Lotes: cada entrada con lote suma a su saldo por lote (lot_balances). El saldo del producto por sucursal sigue en
--     stock_balances (la suma de los lotes nunca pasa de ese saldo; la diferencia es existencia sin lote, de antes).
--   * Cuentas por pagar: de contado (efectivo desde la caja de quien recibe, o por otro medio) o a crédito con fecha de
--     vencimiento; abonos después. Lo pagado en efectivo sale de la caja como "Pago a proveedor" (SUPPLIER_PAYMENT).
--   Todo es inmutable: una recepción equivocada se corrige con un ajuste o una devolución (Fase 13-3).
-- =====================================================================

CREATE TABLE lot_balances (
    branch_id   UUID           NOT NULL REFERENCES branches (id),
    product_id  UUID           NOT NULL REFERENCES products (id),
    lot_id      UUID           NOT NULL REFERENCES lots (id),
    quantity    NUMERIC(14,4)  NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    PRIMARY KEY (branch_id, lot_id),
    CONSTRAINT ck_lot_balances_quantity CHECK (quantity >= 0)
);
CREATE INDEX ix_lot_balances_product ON lot_balances (product_id, branch_id);
CREATE INDEX ix_lots_expiration ON lots (expiration_date);
CREATE INDEX ix_stock_movements_lot ON stock_movements (lot_id) WHERE lot_id IS NOT NULL;

CREATE SEQUENCE purchase_receipt_seq START WITH 1;

CREATE TABLE purchase_receipts (
    id                      UUID           PRIMARY KEY,
    number                  BIGINT         NOT NULL,
    branch_id               UUID           NOT NULL REFERENCES branches (id),
    supplier_id             UUID           NOT NULL REFERENCES suppliers (party_id),
    supplier_invoice        VARCHAR(40)    NOT NULL,
    invoice_date            DATE           NOT NULL,
    payment_type            VARCHAR(10)    NOT NULL,
    due_date                DATE,
    subtotal                NUMERIC(14,2)  NOT NULL,
    tax_total               NUMERIC(14,2)  NOT NULL,
    total                   NUMERIC(14,2)  NOT NULL,
    rejected_total          NUMERIC(14,2)  NOT NULL DEFAULT 0,
    checks_confirmed        BOOLEAN        NOT NULL,
    cold_chain_temperature  NUMERIC(4,1),
    notes                   VARCHAR(500),
    idempotency_key         VARCHAR(100),
    received_by             UUID           NOT NULL,
    received_at             TIMESTAMPTZ    NOT NULL,
    CONSTRAINT uq_purchase_receipts_number UNIQUE (number),
    CONSTRAINT uq_purchase_receipts_invoice UNIQUE (supplier_id, supplier_invoice),
    CONSTRAINT uq_purchase_receipts_idempotency UNIQUE (idempotency_key),
    CONSTRAINT ck_purchase_receipts_payment CHECK (payment_type IN ('PAID', 'CREDIT')),
    CONSTRAINT ck_purchase_receipts_due CHECK ((payment_type = 'CREDIT') = (due_date IS NOT NULL)),
    CONSTRAINT ck_purchase_receipts_totals CHECK (subtotal >= 0 AND tax_total >= 0 AND total >= 0 AND rejected_total >= 0)
);
CREATE INDEX ix_purchase_receipts_received ON purchase_receipts (received_at DESC);
CREATE INDEX ix_purchase_receipts_supplier ON purchase_receipts (supplier_id);

CREATE TABLE purchase_receipt_lines (
    id                     UUID           PRIMARY KEY,
    receipt_id             UUID           NOT NULL REFERENCES purchase_receipts (id),
    line_no                INTEGER        NOT NULL,
    product_id             UUID           NOT NULL REFERENCES products (id),
    unit_id                UUID           NOT NULL REFERENCES units (id),
    quantity               NUMERIC(14,4)  NOT NULL,
    factor                 NUMERIC(14,4)  NOT NULL,
    base_quantity          NUMERIC(14,4)  NOT NULL,
    unit_cost              NUMERIC(14,2)  NOT NULL,
    tax_rate               NUMERIC(5,2)   NOT NULL,
    line_total             NUMERIC(14,2)  NOT NULL,
    lot_id                 UUID           REFERENCES lots (id),
    lot_number             VARCHAR(40),
    expiration_date        DATE,
    sanitary_registration  VARCHAR(80),
    status                 VARCHAR(10)    NOT NULL,
    reject_reason          VARCHAR(200),
    CONSTRAINT uq_purchase_receipt_lines UNIQUE (receipt_id, line_no),
    CONSTRAINT ck_purchase_receipt_lines_status CHECK (status IN ('ACCEPTED', 'REJECTED')),
    CONSTRAINT ck_purchase_receipt_lines_reason CHECK (status = 'ACCEPTED' OR reject_reason IS NOT NULL),
    CONSTRAINT ck_purchase_receipt_lines_quantity CHECK (quantity > 0 AND base_quantity > 0 AND unit_cost >= 0)
);
CREATE INDEX ix_purchase_receipt_lines_lot ON purchase_receipt_lines (lot_id) WHERE lot_id IS NOT NULL;
CREATE INDEX ix_purchase_receipt_lines_product ON purchase_receipt_lines (product_id);

CREATE TABLE supplier_payments (
    id                 UUID           PRIMARY KEY,
    receipt_id         UUID           NOT NULL REFERENCES purchase_receipts (id),
    amount             NUMERIC(14,2)  NOT NULL,
    payment_method_id  UUID           NOT NULL REFERENCES payment_methods (id),
    cash_session_id    UUID           REFERENCES cash_sessions (id),
    reference          VARCHAR(100),
    idempotency_key    VARCHAR(100),
    paid_by            UUID           NOT NULL,
    paid_at            TIMESTAMPTZ    NOT NULL,
    CONSTRAINT uq_supplier_payments_idempotency UNIQUE (idempotency_key),
    CONSTRAINT ck_supplier_payments_amount CHECK (amount > 0)
);
CREATE INDEX ix_supplier_payments_receipt ON supplier_payments (receipt_id);

CREATE TRIGGER trg_purchase_receipts_immutable BEFORE UPDATE OR DELETE ON purchase_receipts
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_purchase_receipt_lines_immutable BEFORE UPDATE OR DELETE ON purchase_receipt_lines
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_supplier_payments_immutable BEFORE UPDATE OR DELETE ON supplier_payments
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_purchase_receipts_truncate BEFORE TRUNCATE ON purchase_receipts
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_purchase_receipt_lines_truncate BEFORE TRUNCATE ON purchase_receipt_lines
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_supplier_payments_truncate BEFORE TRUNCATE ON supplier_payments
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();

-- Caja: pago a proveedor en efectivo (sale).
ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_type;
ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_sign;
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_type CHECK (type IN
    ('SALE', 'SALE_VOID', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT', 'CREDIT_PAYMENT_VOID',
     'ORDER_PAYMENT', 'ORDER_REFUND', 'TIP', 'TIP_VOID', 'TIP_PAYOUT', 'SUPPLIER_PAYMENT'));
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_sign CHECK (
    (type IN ('SALE', 'INCOME', 'CREDIT_PAYMENT', 'ORDER_PAYMENT', 'TIP') AND amount > 0)
    OR (type IN ('SALE_VOID', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT_VOID', 'ORDER_REFUND', 'TIP_VOID',
                 'TIP_PAYOUT', 'SUPPLIER_PAYMENT') AND amount < 0));

-- Permisos (de la base: cualquier negocio compra a proveedores).
INSERT INTO permissions (code, module, description) VALUES
    ('purchases:read',    'purchases', 'Ver las compras recibidas y las cuentas por pagar'),
    ('purchases:receive', 'purchases', 'Registrar la recepción de mercancía de los proveedores'),
    ('purchases:pay',     'purchases', 'Registrar pagos a proveedores');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN (VALUES ('OWNER', 'purchases:read'), ('OWNER', 'purchases:receive'), ('OWNER', 'purchases:pay'),
             ('ADMIN', 'purchases:read'), ('ADMIN', 'purchases:receive'), ('ADMIN', 'purchases:pay'),
             ('WAREHOUSE', 'purchases:read'), ('WAREHOUSE', 'purchases:receive'),
             ('ACCOUNTANT', 'purchases:read'), ('ACCOUNTANT', 'purchases:pay')) AS p(role_code, code)
  ON r.code = p.role_code
WHERE r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);
