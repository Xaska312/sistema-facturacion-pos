-- =====================================================================
-- Fase 10a: fiado (decisión 255).
-- - Medio de pago "Fiado" (CREDIT): la parte fiada de una venta queda como deuda del cliente. Solo a clientes con
--   cupo (customers.credit_limit > 0, que ya existía) y sin pasar el cupo, salvo con credit:manage.
-- - credit_entries: libro inmutable de cada cliente (ventas fiadas, anulaciones, abonos y abonos anulados).
--   amount con signo: positivo aumenta la deuda, negativo la reduce. credit_accounts guarda el saldo y se bloquea
--   al fiar o abonar (el cupo no se puede pasar con dos ventas a la vez).
-- - Los abonos en efectivo entran a la caja abierta de quien los recibe (CREDIT_PAYMENT) y su anulación sale de
--   la caja (CREDIT_PAYMENT_VOID).
-- =====================================================================

INSERT INTO permissions (code, module, description) VALUES
    ('credit:read',    'credit', 'Ver lo que deben los clientes (fiados) y su estado de cuenta'),
    ('credit:collect', 'credit', 'Recibir abonos de los clientes'),
    ('credit:manage',  'credit', 'Asignar cupos de fiado, fiar por encima del cupo y anular abonos');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
CROSS JOIN (VALUES ('credit:read'), ('credit:collect'), ('credit:manage')) AS p (code)
WHERE r.system_role AND r.code IN ('OWNER', 'ADMIN')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
CROSS JOIN (VALUES ('credit:read'), ('credit:collect')) AS p (code)
WHERE r.system_role AND r.code IN ('CASHIER', 'SELLER')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'credit:read' FROM roles r
WHERE r.system_role AND r.code = 'ACCOUNTANT'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'credit:read');

-- ---------------------------------------------------------------------
-- Medio de pago "Fiado" (no entra al efectivo)
-- ---------------------------------------------------------------------
INSERT INTO payment_methods (id, code, name, affects_cash, requires_reference, sort_order)
SELECT '01920000-0000-7000-8000-000000000704', 'CREDIT', 'Fiado', FALSE, FALSE, 4
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE code = 'CREDIT')
  AND NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = '01920000-0000-7000-8000-000000000704');

-- ---------------------------------------------------------------------
-- Abonos en la caja
-- ---------------------------------------------------------------------
ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_type;
ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_sign;
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_type CHECK (type IN
    ('SALE', 'SALE_VOID', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT', 'CREDIT_PAYMENT_VOID'));
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_sign CHECK (
    (type IN ('SALE', 'INCOME', 'CREDIT_PAYMENT') AND amount > 0)
    OR (type IN ('SALE_VOID', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT_VOID') AND amount < 0));

-- ---------------------------------------------------------------------
-- Cuentas de fiado
-- ---------------------------------------------------------------------
CREATE TABLE credit_accounts (
    customer_id  UUID          PRIMARY KEY REFERENCES customers (party_id),
    balance      NUMERIC(14,2) NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ   NOT NULL
);

CREATE INDEX ix_credit_accounts_balance ON credit_accounts (balance DESC) WHERE balance <> 0;

CREATE TABLE credit_entries (
    id                 UUID          PRIMARY KEY,
    entry_no           BIGINT        GENERATED ALWAYS AS IDENTITY,
    customer_id        UUID          NOT NULL REFERENCES customers (party_id),
    type               VARCHAR(20)   NOT NULL,
    amount             NUMERIC(14,2) NOT NULL,
    sale_id            UUID          REFERENCES sales (id),
    payment_id         UUID          REFERENCES credit_entries (id),
    payment_method_id  UUID          REFERENCES payment_methods (id),
    method_code        VARCHAR(20),
    reference          VARCHAR(60),
    notes              VARCHAR(255),
    cash_session_id    UUID          REFERENCES cash_sessions (id),
    idempotency_key    VARCHAR(100),
    created_by         UUID,
    created_at         TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_credit_entries_type CHECK (type IN ('SALE', 'SALE_VOID', 'PAYMENT', 'PAYMENT_VOID')),
    CONSTRAINT ck_credit_entries_sign CHECK (
        (type IN ('SALE', 'PAYMENT_VOID') AND amount > 0)
        OR (type IN ('SALE_VOID', 'PAYMENT') AND amount < 0)),
    CONSTRAINT ck_credit_entries_links CHECK (
        (type IN ('SALE', 'SALE_VOID') AND sale_id IS NOT NULL AND payment_id IS NULL)
        OR (type = 'PAYMENT' AND sale_id IS NULL AND payment_id IS NULL AND payment_method_id IS NOT NULL)
        OR (type = 'PAYMENT_VOID' AND sale_id IS NULL AND payment_id IS NOT NULL)),
    CONSTRAINT uq_credit_entries_idempotency UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX uq_credit_entries_entry ON credit_entries (entry_no);
CREATE INDEX ix_credit_entries_customer ON credit_entries (customer_id, entry_no);
-- Una venta se fía una vez y se reversa una vez; un abono se anula una vez.
CREATE UNIQUE INDEX uq_credit_entries_sale ON credit_entries (sale_id) WHERE type = 'SALE';
CREATE UNIQUE INDEX uq_credit_entries_sale_void ON credit_entries (sale_id) WHERE type = 'SALE_VOID';
CREATE UNIQUE INDEX uq_credit_entries_payment_void ON credit_entries (payment_id) WHERE type = 'PAYMENT_VOID';

CREATE TRIGGER trg_credit_entries_immutable
    BEFORE UPDATE OR DELETE ON credit_entries
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_credit_entries_no_truncate BEFORE TRUNCATE ON credit_entries
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
