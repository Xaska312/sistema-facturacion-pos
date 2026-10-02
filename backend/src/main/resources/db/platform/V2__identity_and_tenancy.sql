-- =====================================================================
-- Identidad global y tenancy (Fase 1)
-- =====================================================================

CREATE TABLE platform.users (
    id               UUID         PRIMARY KEY,
    email            VARCHAR(255) NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    full_name        VARCHAR(150) NOT NULL,
    phone            VARCHAR(30),
    status           VARCHAR(30)  NOT NULL,
    platform_admin   BOOLEAN      NOT NULL DEFAULT FALSE,
    failed_attempts  INTEGER      NOT NULL DEFAULT 0,
    locked_until     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email_lower CHECK (email = lower(email)),
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'BLOCKED', 'PENDING_VERIFICATION'))
);

CREATE TABLE platform.tenants (
    id               UUID         PRIMARY KEY,
    slug             VARCHAR(41)  NOT NULL,
    schema_name      VARCHAR(43)  NOT NULL,
    legal_name       VARCHAR(200) NOT NULL,
    trade_name       VARCHAR(200) NOT NULL,
    business_type    VARCHAR(30)  NOT NULL,
    status           VARCHAR(30)  NOT NULL,
    owner_user_id    UUID         NOT NULL REFERENCES platform.users (id),
    failure_reason   VARCHAR(500),
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_tenants_slug UNIQUE (slug),
    CONSTRAINT uq_tenants_schema UNIQUE (schema_name),
    CONSTRAINT ck_tenants_slug CHECK (slug ~ '^[a-z][a-z0-9_]{2,40}$'),
    CONSTRAINT ck_tenants_schema CHECK (schema_name = 't_' || slug),
    CONSTRAINT ck_tenants_business_type CHECK (business_type IN ('RETAIL', 'PHARMACY', 'RESTAURANT', 'SERVICES')),
    CONSTRAINT ck_tenants_status CHECK (status IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'FAILED'))
);
CREATE INDEX ix_tenants_owner ON platform.tenants (owner_user_id);

CREATE TABLE platform.memberships (
    id               UUID         PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES platform.users (id),
    tenant_id        UUID         NOT NULL REFERENCES platform.tenants (id),
    status           VARCHAR(30)  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_memberships_user_tenant UNIQUE (user_id, tenant_id),
    CONSTRAINT ck_memberships_status CHECK (status IN ('ACTIVE', 'INVITED', 'REVOKED'))
);
CREATE INDEX ix_memberships_tenant ON platform.memberships (tenant_id);

CREATE TABLE platform.refresh_tokens (
    id               UUID         PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES platform.users (id),
    tenant_id        UUID         REFERENCES platform.tenants (id),
    token_hash       VARCHAR(64)  NOT NULL,
    expires_at       TIMESTAMPTZ  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL,
    revoked_at       TIMESTAMPTZ,
    replaced_by      UUID,
    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);
CREATE INDEX ix_refresh_tokens_user ON platform.refresh_tokens (user_id);
