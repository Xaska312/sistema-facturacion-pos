-- =====================================================================
-- Fase 5: caja y ventas.
-- Movimientos de caja, ventas y sus detalles son inmutables (triggers).
-- Las sesiones de caja solo pasan de OPEN a CLOSED; las ventas solo de COMPLETED a VOIDED.
-- =====================================================================

-- Cierre ciego: el cajero cuenta sin ver el esperado; el esperado y la diferencia los ve quien tenga cash:audit.
INSERT INTO permissions (code, module, description) VALUES
    ('cash:audit', 'cash', 'Ver el efectivo esperado y las diferencias de los arqueos');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'cash:audit' FROM roles r WHERE r.code IN ('OWNER', 'ADMIN', 'ACCOUNTANT');

-- El cajero ve solo sus propias sesiones (no el historial ni los arqueos de los demás).
DELETE FROM role_permissions
WHERE permission_code = 'cash:read' AND role_id IN (SELECT id FROM roles WHERE code = 'CASHIER');

-- ---------------------------------------------------------------------
-- Medios de pago
-- ---------------------------------------------------------------------
CREATE TABLE payment_methods (
    id                 UUID         PRIMARY KEY,
    code               VARCHAR(20)  NOT NULL,
    name               VARCHAR(60)  NOT NULL,
    affects_cash       BOOLEAN      NOT NULL,
    requires_reference BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order         INTEGER      NOT NULL DEFAULT 0,
    active             BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_payment_methods_code UNIQUE (code)
);

INSERT INTO payment_methods (id, code, name, affects_cash, requires_reference, sort_order) VALUES
    ('01920000-0000-7000-8000-000000000701', 'CASH',     'Efectivo',                                  TRUE,  FALSE, 1),
    ('01920000-0000-7000-8000-000000000702', 'CARD',     'Tarjeta débito/crédito',                    FALSE, FALSE, 2),
    ('01920000-0000-7000-8000-000000000703', 'TRANSFER', 'Transferencia (Nequi, Daviplata, bancos)', FALSE, FALSE, 3);

-- ---------------------------------------------------------------------
-- Consecutivos de documentos (bloqueo de fila al asignar: sin huecos)
-- ---------------------------------------------------------------------
CREATE TABLE document_sequences (
    code         VARCHAR(30)  PRIMARY KEY,
    prefix       VARCHAR(10)  NOT NULL,
    next_number  BIGINT       NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_document_sequences_next CHECK (next_number > 0)
);

INSERT INTO document_sequences (code, prefix, next_number) VALUES ('SALE', 'POS', 1);

-- ---------------------------------------------------------------------
-- Sesiones de caja
-- ---------------------------------------------------------------------
CREATE TABLE cash_sessions (
    id                UUID          PRIMARY KEY,
    cash_register_id  UUID          NOT NULL REFERENCES cash_registers (id),
    branch_id         UUID          NOT NULL REFERENCES branches (id),
    opened_by         UUID          NOT NULL REFERENCES members (id),
    status            VARCHAR(10)   NOT NULL,
    opening_amount    NUMERIC(14,2) NOT NULL,
    opening_notes     VARCHAR(255),
    opened_at         TIMESTAMPTZ   NOT NULL,
    closed_at         TIMESTAMPTZ,
    closed_by         UUID          REFERENCES members (id),
    counted_amount    NUMERIC(14,2),
    expected_amount   NUMERIC(14,2),
    difference        NUMERIC(14,2),
    closing_notes     VARCHAR(500),
    version           BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_cash_sessions_status CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT ck_cash_sessions_opening CHECK (opening_amount >= 0),
    CONSTRAINT ck_cash_sessions_closed CHECK (
        (status = 'OPEN' AND closed_at IS NULL AND counted_amount IS NULL AND expected_amount IS NULL
            AND difference IS NULL)
        OR (status = 'CLOSED' AND closed_at IS NOT NULL AND counted_amount IS NOT NULL
            AND expected_amount IS NOT NULL AND difference IS NOT NULL AND counted_amount >= 0))
);

-- Una sola sesión abierta por caja y por usuario
CREATE UNIQUE INDEX uq_cash_sessions_open_register ON cash_sessions (cash_register_id) WHERE status = 'OPEN';
CREATE UNIQUE INDEX uq_cash_sessions_open_user ON cash_sessions (opened_by) WHERE status = 'OPEN';
CREATE INDEX ix_cash_sessions_opened ON cash_sessions (opened_at DESC);

CREATE FUNCTION guard_cash_session_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Las sesiones de caja no se borran' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Una sesión de caja cerrada no se modifica ni se reabre' USING ERRCODE = 'restrict_violation';
    END IF;
    IF (NEW.id, NEW.cash_register_id, NEW.branch_id, NEW.opened_by, NEW.opening_amount, NEW.opened_at)
        IS DISTINCT FROM (OLD.id, OLD.cash_register_id, OLD.branch_id, OLD.opened_by, OLD.opening_amount, OLD.opened_at) THEN
        RAISE EXCEPTION 'Los datos de apertura de una sesión de caja no cambian' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cash_sessions_guard
    BEFORE UPDATE OR DELETE ON cash_sessions
    FOR EACH ROW EXECUTE FUNCTION guard_cash_session_change();

-- ---------------------------------------------------------------------
-- Movimientos de caja (efectivo). Esperado = apertura + suma de movimientos.
-- ---------------------------------------------------------------------
CREATE TABLE cash_movements (
    id                UUID          PRIMARY KEY,
    entry_no          BIGINT        GENERATED ALWAYS AS IDENTITY,
    cash_session_id   UUID          NOT NULL REFERENCES cash_sessions (id),
    type              VARCHAR(20)   NOT NULL,
    amount            NUMERIC(14,2) NOT NULL,
    reason            VARCHAR(255),
    reference_type    VARCHAR(30),
    reference_id      UUID,
    idempotency_key   VARCHAR(100),
    created_by        UUID,
    created_at        TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_cash_movements_type CHECK (type IN ('SALE', 'SALE_VOID', 'INCOME', 'EXPENSE', 'WITHDRAWAL')),
    CONSTRAINT ck_cash_movements_sign CHECK (
        (type IN ('SALE', 'INCOME') AND amount > 0)
        OR (type IN ('SALE_VOID', 'EXPENSE', 'WITHDRAWAL') AND amount < 0)),
    CONSTRAINT uq_cash_movements_idempotency UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX uq_cash_movements_entry ON cash_movements (entry_no);
CREATE INDEX ix_cash_movements_session ON cash_movements (cash_session_id, entry_no);

CREATE TRIGGER trg_cash_movements_immutable
    BEFORE UPDATE OR DELETE ON cash_movements
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
CREATE TABLE sales (
    id                           UUID          PRIMARY KEY,
    prefix                       VARCHAR(10)   NOT NULL,
    number                       BIGINT        NOT NULL,
    status                       VARCHAR(10)   NOT NULL,
    branch_id                    UUID          NOT NULL REFERENCES branches (id),
    cash_register_id             UUID          NOT NULL REFERENCES cash_registers (id),
    cash_session_id              UUID          NOT NULL REFERENCES cash_sessions (id),
    -- Cliente identificado (datos copiados al vender, para el documento electrónico futuro)
    customer_id                  UUID          NOT NULL REFERENCES parties (id),
    customer_document_type       VARCHAR(10)   NOT NULL,
    customer_document_number     VARCHAR(20)   NOT NULL,
    customer_verification_digit  INTEGER,
    customer_name                VARCHAR(255)  NOT NULL,
    price_list_id                UUID          REFERENCES price_lists (id),
    prices_include_tax           BOOLEAN       NOT NULL,
    gross_total                  NUMERIC(14,2) NOT NULL,
    discount_total               NUMERIC(14,2) NOT NULL,
    subtotal                     NUMERIC(14,2) NOT NULL,
    tax_total                    NUMERIC(14,2) NOT NULL,
    total                        NUMERIC(14,2) NOT NULL,
    paid_total                   NUMERIC(14,2) NOT NULL,
    change_amount                NUMERIC(14,2) NOT NULL,
    item_count                   INTEGER       NOT NULL,
    notes                        VARCHAR(255),
    idempotency_key              VARCHAR(100)  NOT NULL,
    created_by                   UUID          NOT NULL,
    created_at                   TIMESTAMPTZ   NOT NULL,
    voided_at                    TIMESTAMPTZ,
    voided_by                    UUID,
    void_reason                  VARCHAR(255),
    void_cash_session_id         UUID          REFERENCES cash_sessions (id),
    version                      BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT uq_sales_number UNIQUE (prefix, number),
    CONSTRAINT uq_sales_idempotency UNIQUE (idempotency_key),
    CONSTRAINT ck_sales_status CHECK (status IN ('COMPLETED', 'VOIDED')),
    CONSTRAINT ck_sales_totals CHECK (total >= 0 AND paid_total >= total AND change_amount >= 0),
    CONSTRAINT ck_sales_void CHECK (
        (status = 'COMPLETED' AND voided_at IS NULL AND void_reason IS NULL)
        OR (status = 'VOIDED' AND voided_at IS NOT NULL AND void_reason IS NOT NULL))
);

CREATE INDEX ix_sales_created ON sales (created_at DESC);
CREATE INDEX ix_sales_branch_created ON sales (branch_id, created_at DESC);
CREATE INDEX ix_sales_session ON sales (cash_session_id);
CREATE INDEX ix_sales_void_session ON sales (void_cash_session_id) WHERE void_cash_session_id IS NOT NULL;
CREATE INDEX ix_sales_customer ON sales (customer_id);

CREATE FUNCTION guard_sale_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Las ventas no se borran; se anulan' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status <> 'COMPLETED' OR NEW.status <> 'VOIDED' THEN
        RAISE EXCEPTION 'Una venta solo puede pasar de COMPLETED a VOIDED' USING ERRCODE = 'restrict_violation';
    END IF;
    IF (NEW.id, NEW.prefix, NEW.number, NEW.branch_id, NEW.cash_register_id, NEW.cash_session_id, NEW.customer_id,
        NEW.gross_total, NEW.discount_total, NEW.subtotal, NEW.tax_total, NEW.total, NEW.paid_total,
        NEW.change_amount, NEW.created_by, NEW.created_at, NEW.idempotency_key)
        IS DISTINCT FROM
       (OLD.id, OLD.prefix, OLD.number, OLD.branch_id, OLD.cash_register_id, OLD.cash_session_id, OLD.customer_id,
        OLD.gross_total, OLD.discount_total, OLD.subtotal, OLD.tax_total, OLD.total, OLD.paid_total,
        OLD.change_amount, OLD.created_by, OLD.created_at, OLD.idempotency_key) THEN
        RAISE EXCEPTION 'Los datos de una venta no cambian' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_guard
    BEFORE UPDATE OR DELETE ON sales
    FOR EACH ROW EXECUTE FUNCTION guard_sale_change();

CREATE TABLE sale_items (
    id                UUID          PRIMARY KEY,
    sale_id           UUID          NOT NULL REFERENCES sales (id),
    line_no           INTEGER       NOT NULL,
    product_id        UUID          NOT NULL REFERENCES products (id),
    sku               VARCHAR(40)   NOT NULL,
    name              VARCHAR(200)  NOT NULL,
    unit_id           UUID          NOT NULL REFERENCES units (id),
    unit_code         VARCHAR(10)   NOT NULL,
    quantity          NUMERIC(14,4) NOT NULL,
    factor            NUMERIC(14,4) NOT NULL,
    base_quantity     NUMERIC(14,4) NOT NULL,
    unit_price        NUMERIC(14,2) NOT NULL,
    gross_amount      NUMERIC(14,2) NOT NULL,
    discount_percent  NUMERIC(5,2)  NOT NULL,
    discount_amount   NUMERIC(14,2) NOT NULL,
    tax_id            UUID          NOT NULL REFERENCES taxes (id),
    tax_type          VARCHAR(20)   NOT NULL,
    tax_rate          NUMERIC(5,2)  NOT NULL,
    taxable_base      NUMERIC(14,2) NOT NULL,
    tax_amount        NUMERIC(14,2) NOT NULL,
    total             NUMERIC(14,2) NOT NULL,
    unit_cost         NUMERIC(14,2) NOT NULL,
    track_inventory   BOOLEAN       NOT NULL,
    CONSTRAINT uq_sale_items_line UNIQUE (sale_id, line_no),
    CONSTRAINT ck_sale_items_quantity CHECK (quantity > 0 AND base_quantity > 0),
    CONSTRAINT ck_sale_items_discount CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

CREATE INDEX ix_sale_items_product ON sale_items (product_id);

CREATE TABLE sale_payments (
    id                 UUID          PRIMARY KEY,
    sale_id            UUID          NOT NULL REFERENCES sales (id),
    line_no            INTEGER       NOT NULL,
    payment_method_id  UUID          NOT NULL REFERENCES payment_methods (id),
    method_code        VARCHAR(20)   NOT NULL,
    affects_cash       BOOLEAN       NOT NULL,
    -- amount: lo que se aplica a la venta; tendered: lo entregado (en efectivo incluye el cambio)
    amount             NUMERIC(14,2) NOT NULL,
    tendered           NUMERIC(14,2) NOT NULL,
    reference          VARCHAR(60),
    CONSTRAINT uq_sale_payments_line UNIQUE (sale_id, line_no),
    CONSTRAINT ck_sale_payments_amounts CHECK (amount >= 0 AND tendered >= amount)
);

-- Totales por impuesto (base para la facturación electrónica futura)
CREATE TABLE sale_tax_totals (
    sale_id        UUID          NOT NULL REFERENCES sales (id),
    tax_id         UUID          NOT NULL REFERENCES taxes (id),
    tax_type       VARCHAR(20)   NOT NULL,
    tax_rate       NUMERIC(5,2)  NOT NULL,
    taxable_base   NUMERIC(14,2) NOT NULL,
    tax_amount     NUMERIC(14,2) NOT NULL,
    PRIMARY KEY (sale_id, tax_id)
);

CREATE TRIGGER trg_sale_items_immutable
    BEFORE UPDATE OR DELETE ON sale_items
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();

CREATE TRIGGER trg_sale_payments_immutable
    BEFORE UPDATE OR DELETE ON sale_payments
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();

CREATE TRIGGER trg_sale_tax_totals_immutable
    BEFORE UPDATE OR DELETE ON sale_tax_totals
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
