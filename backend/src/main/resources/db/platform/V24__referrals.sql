-- Decisión 312: referidos y aliados.
--   * partners: contadores y distribuidores que traen negocios; ganan el 20 % del primer pago de cada uno (Bre-B).
--   * referral_codes: un solo espacio de códigos para negocios y aliados (cada código es de uno de los dos).
--   * referrals: el negocio nuevo que entró con un código; cuenta (QUALIFIED) cuando paga su primer mes.
CREATE TABLE platform.partners (
    id          UUID          PRIMARY KEY,
    name        VARCHAR(120)  NOT NULL,
    kind        VARCHAR(12)   NOT NULL CHECK (kind IN ('ACCOUNTANT', 'DISTRIBUTOR')),
    phone       VARCHAR(30),
    email       VARCHAR(160),
    payout_key  VARCHAR(64),
    note        VARCHAR(300),
    active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ   NOT NULL,
    created_by  UUID          NOT NULL
);

CREATE TABLE platform.referral_codes (
    code        VARCHAR(20)   PRIMARY KEY,
    tenant_id   UUID          UNIQUE REFERENCES platform.tenants (id),
    partner_id  UUID          UNIQUE REFERENCES platform.partners (id),
    created_at  TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_referral_codes_owner CHECK ((tenant_id IS NULL) <> (partner_id IS NULL))
);

CREATE TABLE platform.referrals (
    referred_tenant_id  UUID           PRIMARY KEY REFERENCES platform.tenants (id),
    code                VARCHAR(20)    NOT NULL REFERENCES platform.referral_codes (code),
    referrer_tenant_id  UUID           REFERENCES platform.tenants (id),
    partner_id          UUID           REFERENCES platform.partners (id),
    status              VARCHAR(10)    NOT NULL CHECK (status IN ('PENDING', 'QUALIFIED')),
    created_at          TIMESTAMPTZ    NOT NULL,
    qualified_at        TIMESTAMPTZ,
    first_amount        NUMERIC(14, 2),
    commission          NUMERIC(14, 2),
    paid_at             TIMESTAMPTZ,
    paid_reference      VARCHAR(60),
    paid_by             UUID,
    CONSTRAINT ck_referrals_source CHECK ((referrer_tenant_id IS NULL) <> (partner_id IS NULL))
);
CREATE INDEX ix_referrals_referrer ON platform.referrals (referrer_tenant_id) WHERE referrer_tenant_id IS NOT NULL;
CREATE INDEX ix_referrals_partner ON platform.referrals (partner_id) WHERE partner_id IS NOT NULL;
