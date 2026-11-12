-- =====================================================================
-- Decisión 320: Finanzas, parte A. Gastos con categorías.
--   * expense_categories: categorías de gasto del negocio (unas de fábrica; se renombran, se agregan y se apagan).
--   * expenses: cada gasto con su categoría, sede, proveedor opcional, medio de pago y nota. Si se pagó en efectivo
--     sale de la caja (cash_movements EXPENSE con reference_type 'EXPENSE'); con otro medio no toca la caja.
--     No se borra: se anula con motivo. Se pueden corregir la categoría, el proveedor, la nota y la fecha.
--   * Los egresos de caja de antes (sin categoría) no se copian: aparecen como "Sin clasificar" y, al clasificarlos,
--     se crea su gasto unido al movimiento (cash_movement_id), sin mover otra vez la caja.
--   * expense_documents: la foto o el PDF del soporte, en el esquema del negocio.
--   * Caja: EXPENSE_VOID devuelve a la caja el efectivo de un gasto anulado.
--   * Permisos expenses:read y expenses:manage (Propietario, Administrador y Contador). El cajero registra el gasto
--     en efectivo de su caja con cash:operate.
-- =====================================================================

CREATE TABLE expense_categories (
    id          UUID          PRIMARY KEY,
    name        VARCHAR(60)   NOT NULL,
    active      BOOLEAN       NOT NULL DEFAULT TRUE,
    sort_order  INTEGER       NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_expense_categories_name ON expense_categories (lower(name));

INSERT INTO expense_categories (id, name, sort_order) VALUES
    ('01920000-0000-7000-8000-000000000a01', 'Arriendo',            1),
    ('01920000-0000-7000-8000-000000000a02', 'Servicios públicos',  2),
    ('01920000-0000-7000-8000-000000000a03', 'Nómina',              3),
    ('01920000-0000-7000-8000-000000000a04', 'Insumos',             4),
    ('01920000-0000-7000-8000-000000000a05', 'Transporte',          5),
    ('01920000-0000-7000-8000-000000000a06', 'Mantenimiento',       6),
    ('01920000-0000-7000-8000-000000000a07', 'Impuestos',           7),
    ('01920000-0000-7000-8000-000000000a08', 'Publicidad',          8),
    ('01920000-0000-7000-8000-000000000a09', 'Otros',               9);

CREATE TABLE expenses (
    id                 UUID           PRIMARY KEY,
    number             BIGINT         GENERATED ALWAYS AS IDENTITY,
    expense_date       DATE           NOT NULL,
    category_id        UUID           NOT NULL REFERENCES expense_categories (id),
    branch_id          UUID           NOT NULL REFERENCES branches (id),
    supplier_id        UUID           REFERENCES suppliers (party_id),
    amount             NUMERIC(14,2)  NOT NULL,
    payment_method_id  UUID           NOT NULL REFERENCES payment_methods (id),
    -- Caja de donde salió el efectivo (nulo si se pagó con otro medio).
    cash_session_id    UUID           REFERENCES cash_sessions (id),
    -- Egreso de caja de antes que se clasificó después (el gasto no movió la caja: ya estaba movida).
    cash_movement_id   UUID           REFERENCES cash_movements (id),
    reference          VARCHAR(100),
    note               VARCHAR(255),
    status             VARCHAR(10)    NOT NULL DEFAULT 'ACTIVE',
    void_reason        VARCHAR(255),
    voided_by          UUID,
    voided_at          TIMESTAMPTZ,
    idempotency_key    VARCHAR(100),
    created_by         UUID           NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    CONSTRAINT uq_expenses_number UNIQUE (number),
    CONSTRAINT uq_expenses_idempotency UNIQUE (idempotency_key),
    CONSTRAINT uq_expenses_cash_movement UNIQUE (cash_movement_id),
    CONSTRAINT ck_expenses_amount CHECK (amount > 0),
    CONSTRAINT ck_expenses_status CHECK (status IN ('ACTIVE', 'VOID')),
    CONSTRAINT ck_expenses_void CHECK (
        (status = 'ACTIVE' AND void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL)
        OR (status = 'VOID' AND void_reason IS NOT NULL AND voided_by IS NOT NULL AND voided_at IS NOT NULL))
);
CREATE INDEX ix_expenses_date ON expenses (expense_date DESC, number DESC);
CREATE INDEX ix_expenses_category ON expenses (category_id, expense_date);
CREATE INDEX ix_expenses_supplier ON expenses (supplier_id) WHERE supplier_id IS NOT NULL;

-- Un gasto no se borra ni cambia de valor, medio de pago, caja o sede: se anula y se registra de nuevo.
CREATE FUNCTION guard_expense_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Los gastos no se borran: se anulan' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status = 'VOID' THEN
        RAISE EXCEPTION 'Un gasto anulado no se modifica' USING ERRCODE = 'restrict_violation';
    END IF;
    IF (NEW.id, NEW.number, NEW.amount, NEW.payment_method_id, NEW.cash_session_id, NEW.cash_movement_id,
        NEW.branch_id, NEW.created_by, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.number, OLD.amount, OLD.payment_method_id, OLD.cash_session_id,
        OLD.cash_movement_id, OLD.branch_id, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION 'El valor, el medio de pago, la caja y la sede de un gasto no cambian'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expenses_guard BEFORE UPDATE OR DELETE ON expenses
    FOR EACH ROW EXECUTE FUNCTION guard_expense_change();
CREATE TRIGGER trg_expenses_truncate BEFORE TRUNCATE ON expenses
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();

-- Soporte del gasto (foto o PDF). Uno por gasto; se puede reemplazar mientras el gasto esté activo.
CREATE TABLE expense_documents (
    expense_id    UUID          PRIMARY KEY REFERENCES expenses (id),
    file_name     VARCHAR(160)  NOT NULL,
    content_type  VARCHAR(60)   NOT NULL,
    size_bytes    INTEGER       NOT NULL,
    content       BYTEA         NOT NULL,
    uploaded_by   UUID          NOT NULL,
    uploaded_at   TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_expense_documents_size CHECK (size_bytes > 0 AND size_bytes <= 5242880)
);

-- Caja: devolución del efectivo de un gasto anulado (entra).
ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_type;
ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_sign;
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_type CHECK (type IN
    ('SALE', 'SALE_VOID', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT', 'CREDIT_PAYMENT_VOID',
     'ORDER_PAYMENT', 'ORDER_REFUND', 'TIP', 'TIP_VOID', 'TIP_PAYOUT', 'SUPPLIER_PAYMENT', 'EXPENSE_VOID'));
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_sign CHECK (
    (type IN ('SALE', 'INCOME', 'CREDIT_PAYMENT', 'ORDER_PAYMENT', 'TIP', 'EXPENSE_VOID') AND amount > 0)
    OR (type IN ('SALE_VOID', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT_VOID', 'ORDER_REFUND', 'TIP_VOID',
                 'TIP_PAYOUT', 'SUPPLIER_PAYMENT') AND amount < 0));

-- Los egresos de caja sin clasificar se buscan por tipo.
CREATE INDEX ix_cash_movements_expense ON cash_movements (created_at) WHERE type = 'EXPENSE' AND reference_id IS NULL;

-- Permisos (de la base: cualquier negocio tiene gastos).
INSERT INTO permissions (code, module, description) VALUES
    ('expenses:read',   'expenses', 'Ver los gastos del negocio y sus totales por categoría'),
    ('expenses:manage', 'expenses', 'Registrar, corregir y anular gastos, y configurar sus categorías');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN (VALUES ('OWNER', 'expenses:read'), ('OWNER', 'expenses:manage'),
             ('ADMIN', 'expenses:read'), ('ADMIN', 'expenses:manage'),
             ('ACCOUNTANT', 'expenses:read'), ('ACCOUNTANT', 'expenses:manage')) AS p(role_code, code)
  ON r.code = p.role_code
WHERE r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);
