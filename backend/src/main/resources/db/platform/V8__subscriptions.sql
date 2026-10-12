-- =====================================================================
-- Fase 8b: planes, suscripciones, pagos registrados a mano y códigos de activación.
-- Sin pasarela de pagos: el administrador de plataforma registra cada pago (transferencia, Nequi…).
-- =====================================================================

-- Planes. Límites NULL = sin límite. Precios NULL = aún no definidos (los fija el administrador en la consola).
CREATE TABLE platform.plans (
    code           VARCHAR(20)    PRIMARY KEY,
    name           VARCHAR(60)    NOT NULL,
    max_branches   INTEGER,
    max_users      INTEGER,
    monthly_price  NUMERIC(14, 2),
    annual_price   NUMERIC(14, 2),
    sort_order     INTEGER        NOT NULL,
    active         BOOLEAN        NOT NULL DEFAULT TRUE,
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT ck_plans_code CHECK (code ~ '^[A-Z][A-Z0-9_]{1,19}$'),
    CONSTRAINT ck_plans_branches CHECK (max_branches IS NULL OR max_branches >= 1),
    CONSTRAINT ck_plans_users CHECK (max_users IS NULL OR max_users >= 1),
    CONSTRAINT ck_plans_prices CHECK ((monthly_price IS NULL OR monthly_price >= 0)
        AND (annual_price IS NULL OR annual_price >= 0))
);

INSERT INTO platform.plans (code, name, max_branches, max_users, sort_order) VALUES
    ('BASIC', 'Básico', 1, 3, 1),
    ('PRO',   'Pro',    5, NULL, 2);

-- Suscripción vigente de cada negocio (una fila por negocio). ends_at = fin de la prueba o del periodo pagado.
-- El estado que ve el usuario se calcula: prueba / activa / en gracia (3 días) / vencida.
CREATE TABLE platform.subscriptions (
    tenant_id              UUID          PRIMARY KEY REFERENCES platform.tenants (id),
    plan_code              VARCHAR(20)   NOT NULL REFERENCES platform.plans (code),
    trial                  BOOLEAN       NOT NULL,
    billing_cycle          VARCHAR(10)   NOT NULL DEFAULT 'MONTHLY',
    started_at             TIMESTAMPTZ   NOT NULL,
    ends_at                TIMESTAMPTZ   NOT NULL,
    -- Último aviso por correo enviado y para qué fecha de vencimiento (no repetir avisos).
    last_reminder_stage    VARCHAR(10),
    last_reminder_ends_at  TIMESTAMPTZ,
    updated_at             TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_subscriptions_cycle CHECK (billing_cycle IN ('MONTHLY', 'ANNUAL')),
    CONSTRAINT ck_subscriptions_reminder CHECK (last_reminder_stage IS NULL
        OR last_reminder_stage IN ('D7', 'D3', 'D1', 'ENDED', 'BLOCKED'))
);

CREATE INDEX ix_subscriptions_ends ON platform.subscriptions (ends_at);

-- Pagos y activaciones por código: solo inserción (como el kardex). Un error se corrige con otro registro.
CREATE TABLE platform.subscription_payments (
    id             UUID           PRIMARY KEY,
    tenant_id      UUID           NOT NULL REFERENCES platform.tenants (id),
    plan_code      VARCHAR(20)    NOT NULL REFERENCES platform.plans (code),
    billing_cycle  VARCHAR(10)    NOT NULL,
    periods        INTEGER        NOT NULL,
    amount         NUMERIC(14, 2) NOT NULL,
    method         VARCHAR(30)    NOT NULL,
    reference      VARCHAR(100),
    notes          VARCHAR(500),
    period_start   TIMESTAMPTZ    NOT NULL,
    period_end     TIMESTAMPTZ    NOT NULL,
    source         VARCHAR(10)    NOT NULL,
    registered_by  UUID           REFERENCES platform.users (id),
    created_at     TIMESTAMPTZ    NOT NULL,
    CONSTRAINT ck_payments_cycle CHECK (billing_cycle IN ('MONTHLY', 'ANNUAL')),
    CONSTRAINT ck_payments_periods CHECK (periods BETWEEN 1 AND 36),
    CONSTRAINT ck_payments_amount CHECK (amount >= 0),
    CONSTRAINT ck_payments_source CHECK (source IN ('PAYMENT', 'CODE')),
    CONSTRAINT ck_payments_period CHECK (period_end > period_start)
);

CREATE INDEX ix_payments_tenant ON platform.subscription_payments (tenant_id, created_at DESC);

CREATE FUNCTION platform.reject_subscription_payment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Los pagos de suscripción no se modifican ni se borran: registra otro.';
END;
$$;

CREATE TRIGGER trg_subscription_payments_immutable BEFORE UPDATE OR DELETE ON platform.subscription_payments
    FOR EACH ROW EXECUTE FUNCTION platform.reject_subscription_payment_change();
CREATE TRIGGER trg_subscription_payments_no_truncate BEFORE TRUNCATE ON platform.subscription_payments
    FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_subscription_payment_change();

-- Códigos de activación: los genera el administrador al vender (plan y meses incluidos). Solo se guarda el hash; la
-- pista (últimos 4 caracteres) sirve para reconocerlo en la lista. Un código sirve una sola vez.
CREATE TABLE platform.activation_codes (
    id              UUID          PRIMARY KEY,
    code_hash       VARCHAR(64)   NOT NULL,
    code_hint       VARCHAR(4)    NOT NULL,
    plan_code       VARCHAR(20)   NOT NULL REFERENCES platform.plans (code),
    months          INTEGER       NOT NULL,
    note            VARCHAR(200),
    expires_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID          NOT NULL REFERENCES platform.users (id),
    created_at      TIMESTAMPTZ   NOT NULL,
    used_at         TIMESTAMPTZ,
    used_by         UUID          REFERENCES platform.users (id),
    used_tenant_id  UUID          REFERENCES platform.tenants (id),
    revoked_at      TIMESTAMPTZ,
    CONSTRAINT uq_activation_codes_hash UNIQUE (code_hash),
    CONSTRAINT ck_activation_codes_months CHECK (months BETWEEN 1 AND 36)
);

CREATE INDEX ix_activation_codes_created ON platform.activation_codes (created_at DESC);

-- Negocios que ya existían: prueba de 14 días con el plan Pro desde hoy (nadie queda bloqueado al actualizar).
INSERT INTO platform.subscriptions (tenant_id, plan_code, trial, billing_cycle, started_at, ends_at, updated_at)
SELECT id, 'PRO', TRUE, 'MONTHLY', now(), now() + INTERVAL '14 days', now()
FROM platform.tenants;
