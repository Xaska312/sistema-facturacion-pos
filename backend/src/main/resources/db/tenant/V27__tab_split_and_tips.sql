-- =====================================================================
-- Fase 12b-5 (decisión 272): cobro de mesas por partes y propina voluntaria.
--   * Por productos: cada persona paga lo suyo; cada parte es una venta y la cuenta sigue abierta hasta cobrar todo.
--   * Propina (ley 1935 de 2018): voluntaria, aparte de la venta (no es ingreso del negocio ni lleva IVA ni INC), del
--     equipo de trabajo; se reparte en partes iguales entre quienes elija el dueño y la entrega queda registrada.
-- =====================================================================

-- Lo ya cobrado de la cuenta: la venta en que salió cada línea.
ALTER TABLE tab_items ADD COLUMN sale_id UUID REFERENCES sales (id);
CREATE INDEX ix_tab_items_sale ON tab_items (sale_id) WHERE sale_id IS NOT NULL;

-- Propina de una venta. Se paga con uno de los medios de la venta; si es efectivo entra a la caja (TIP).
CREATE TABLE sale_tips (
    sale_id            UUID           PRIMARY KEY REFERENCES sales (id),
    branch_id          UUID           NOT NULL REFERENCES branches (id),
    cash_session_id    UUID           NOT NULL,
    amount             NUMERIC(14,2)  NOT NULL,
    payment_method_id  UUID           NOT NULL,
    method_code        VARCHAR(20)    NOT NULL,
    affects_cash       BOOLEAN        NOT NULL,
    suggested_percent  INTEGER,
    created_by         UUID           NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    voided_at          TIMESTAMPTZ,
    voided_by          UUID,
    CONSTRAINT ck_sale_tips_amount CHECK (amount > 0)
);
CREATE INDEX ix_sale_tips_branch ON sale_tips (branch_id, created_at);

-- Entrega de propinas al equipo: lo que se repartió y a quién, en partes iguales.
CREATE TABLE tip_payouts (
    id               UUID           PRIMARY KEY,
    number           BIGINT         GENERATED ALWAYS AS IDENTITY,
    branch_id        UUID           NOT NULL REFERENCES branches (id),
    period_from      DATE           NOT NULL,
    period_to        DATE           NOT NULL,
    amount           NUMERIC(14,2)  NOT NULL,
    from_cash        BOOLEAN        NOT NULL,
    cash_session_id  UUID,
    notes            VARCHAR(200),
    created_by       UUID           NOT NULL,
    created_at       TIMESTAMPTZ    NOT NULL,
    CONSTRAINT uq_tip_payouts_number UNIQUE (number),
    CONSTRAINT ck_tip_payouts_amount CHECK (amount > 0),
    CONSTRAINT ck_tip_payouts_period CHECK (period_to >= period_from),
    CONSTRAINT ck_tip_payouts_cash CHECK (NOT from_cash OR cash_session_id IS NOT NULL)
);
CREATE INDEX ix_tip_payouts_branch ON tip_payouts (branch_id, created_at);

CREATE TABLE tip_payout_shares (
    payout_id  UUID           NOT NULL REFERENCES tip_payouts (id),
    member_id  UUID           NOT NULL,
    name       VARCHAR(150)   NOT NULL,
    amount     NUMERIC(14,2)  NOT NULL,
    PRIMARY KEY (payout_id, member_id),
    CONSTRAINT ck_tip_payout_shares_amount CHECK (amount >= 0)
);

-- Lo repartido no se borra ni se cambia.
CREATE TRIGGER trg_tip_payouts_immutable BEFORE UPDATE OR DELETE ON tip_payouts
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_tip_payout_shares_immutable BEFORE UPDATE OR DELETE ON tip_payout_shares
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();

-- Caja: propina en efectivo (entra), propina de una venta anulada (sale) y entrega de propinas (sale).
ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_type;
ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_sign;
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_type CHECK (type IN
    ('SALE', 'SALE_VOID', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT', 'CREDIT_PAYMENT_VOID',
     'ORDER_PAYMENT', 'ORDER_REFUND', 'TIP', 'TIP_VOID', 'TIP_PAYOUT'));
ALTER TABLE cash_movements ADD CONSTRAINT ck_cash_movements_sign CHECK (
    (type IN ('SALE', 'INCOME', 'CREDIT_PAYMENT', 'ORDER_PAYMENT', 'TIP') AND amount > 0)
    OR (type IN ('SALE_VOID', 'EXPENSE', 'WITHDRAWAL', 'CREDIT_PAYMENT_VOID', 'ORDER_REFUND', 'TIP_VOID',
                 'TIP_PAYOUT') AND amount < 0));

-- Propina sugerida (se pregunta al cliente; 0 = no se sugiere).
INSERT INTO business_settings (setting_key, setting_value, value_type) VALUES ('tip_percent', '10', 'INTEGER')
ON CONFLICT (setting_key) DO NOTHING;

-- Permiso: ver lo recogido en propinas y registrar su reparto.
INSERT INTO permissions (code, module, description) VALUES
    ('tips:manage', 'tables', 'Ver las propinas recogidas y registrar su reparto al equipo');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'tips:manage' FROM roles r
WHERE r.code IN ('OWNER', 'ADMIN') AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'tips:manage');
