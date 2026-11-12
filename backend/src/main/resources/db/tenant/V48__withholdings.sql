-- =====================================================================
-- Decisión 322: Finanzas, parte B. Retenciones que hace el cliente al pagar.
--   * Medio de pago WITHHOLDING ("Retención"): no entra a la caja. El cliente paga una parte con plata y la otra se la
--     retiene (la paga a la DIAN o al municipio a nombre del negocio): la venta o el pedido quedan pagos, sin deuda
--     ni faltante de caja, y la venta conserva su total.
--   * withholdings: el detalle de cada retención (tipo, base, tarifa, valor), de una línea de pago de una venta o de
--     un abono de pedido. Una reversa (al cancelar un pedido) es otra fila, negativa. Solo cambia el certificado.
--   * customer_withholdings: las retenciones que suele hacer un cliente (Indesa: retefuente 6 %). Quien cobra sin el
--     permiso de finanzas solo puede aplicar estas, con su tarifa y sobre la base que calcula XASKA.
--   * Permisos finance:read (ver retenciones; luego el estado de resultados) y finance:manage (registrar cualquier
--     retención, marcar certificados y configurar las del cliente).
-- =====================================================================

INSERT INTO payment_methods (id, code, name, affects_cash, requires_reference, sort_order)
SELECT '01920000-0000-7000-8000-000000000706', 'WITHHOLDING', 'Retención', false, false, 96
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE code = 'WITHHOLDING')
  AND NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = '01920000-0000-7000-8000-000000000706');

CREATE TABLE customer_withholdings (
    customer_id  UUID          NOT NULL REFERENCES customers (party_id),
    type         VARCHAR(12)   NOT NULL,
    rate         NUMERIC(7,4)  NOT NULL,
    updated_by   UUID          NOT NULL,
    updated_at   TIMESTAMPTZ   NOT NULL,
    PRIMARY KEY (customer_id, type),
    CONSTRAINT ck_customer_withholdings_type CHECK (type IN ('RETEFUENTE', 'RETEICA', 'RETEIVA')),
    CONSTRAINT ck_customer_withholdings_rate CHECK (rate > 0 AND rate <= 100)
);

CREATE TABLE withholdings (
    id                    UUID           PRIMARY KEY,
    customer_id           UUID           NOT NULL REFERENCES customers (party_id),
    type                  VARCHAR(12)    NOT NULL,
    kind                  VARCHAR(10)    NOT NULL DEFAULT 'WITHHELD',
    base                  NUMERIC(14,2)  NOT NULL,
    rate                  NUMERIC(7,4),
    amount                NUMERIC(14,2)  NOT NULL,
    sale_id               UUID           REFERENCES sales (id),
    payment_line_no       INTEGER,
    order_id              UUID           REFERENCES orders (id),
    order_payment_id      UUID           REFERENCES order_payments (id),
    reverses_id           UUID           REFERENCES withholdings (id),
    certificate_received  BOOLEAN        NOT NULL DEFAULT FALSE,
    certificate_note      VARCHAR(255),
    certificate_by        UUID,
    certificate_at        TIMESTAMPTZ,
    created_by            UUID           NOT NULL,
    created_at            TIMESTAMPTZ    NOT NULL,
    CONSTRAINT ck_withholdings_type CHECK (type IN ('RETEFUENTE', 'RETEICA', 'RETEIVA')),
    CONSTRAINT ck_withholdings_kind CHECK (
        (kind = 'WITHHELD' AND amount > 0 AND reverses_id IS NULL)
        OR (kind = 'REVERSAL' AND amount < 0 AND reverses_id IS NOT NULL)),
    CONSTRAINT ck_withholdings_source CHECK (
        (sale_id IS NOT NULL AND payment_line_no IS NOT NULL AND order_payment_id IS NULL)
        OR (sale_id IS NULL AND order_id IS NOT NULL AND order_payment_id IS NOT NULL)),
    CONSTRAINT ck_withholdings_base CHECK (base >= 0),
    CONSTRAINT ck_withholdings_rate CHECK (rate IS NULL OR (rate > 0 AND rate <= 100))
);
CREATE INDEX ix_withholdings_created ON withholdings (created_at DESC);
CREATE INDEX ix_withholdings_customer ON withholdings (customer_id, created_at);
CREATE INDEX ix_withholdings_sale ON withholdings (sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX ix_withholdings_order ON withholdings (order_id) WHERE order_id IS NOT NULL;

-- Solo cambian los datos del certificado; no se borran.
CREATE FUNCTION guard_withholding_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Las retenciones no se borran' USING ERRCODE = 'restrict_violation';
    END IF;
    IF (NEW.id, NEW.customer_id, NEW.type, NEW.kind, NEW.base, NEW.rate, NEW.amount, NEW.sale_id, NEW.payment_line_no,
        NEW.order_id, NEW.order_payment_id, NEW.reverses_id, NEW.created_by, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.customer_id, OLD.type, OLD.kind, OLD.base, OLD.rate, OLD.amount, OLD.sale_id,
        OLD.payment_line_no, OLD.order_id, OLD.order_payment_id, OLD.reverses_id, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION 'De una retención solo cambia el certificado' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_withholdings_guard BEFORE UPDATE OR DELETE ON withholdings
    FOR EACH ROW EXECUTE FUNCTION guard_withholding_change();
CREATE TRIGGER trg_withholdings_truncate BEFORE TRUNCATE ON withholdings
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();

INSERT INTO permissions (code, module, description) VALUES
    ('finance:read',   'finance', 'Ver las retenciones (y las finanzas del negocio)'),
    ('finance:manage', 'finance', 'Registrar cualquier retención, marcar certificados y configurar las del cliente');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN (VALUES ('OWNER', 'finance:read'), ('OWNER', 'finance:manage'),
             ('ADMIN', 'finance:read'), ('ADMIN', 'finance:manage'),
             ('ACCOUNTANT', 'finance:read'), ('ACCOUNTANT', 'finance:manage')) AS p(role_code, code)
  ON r.code = p.role_code
WHERE r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);
