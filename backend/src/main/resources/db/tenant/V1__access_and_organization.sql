-- =====================================================================
-- Schema de tenant: organización y acceso (Fase 1).
-- Flyway ejecuta este script con search_path = <schema del tenant>,
-- por eso ninguna tabla lleva schema explícito.
-- =====================================================================

CREATE TABLE business_settings (
    setting_key      VARCHAR(80)  PRIMARY KEY,
    setting_value    VARCHAR(500) NOT NULL,
    value_type       VARCHAR(20)  NOT NULL,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by       UUID,
    CONSTRAINT ck_business_settings_type CHECK (value_type IN ('STRING', 'BOOLEAN', 'INTEGER', 'DECIMAL'))
);

CREATE TABLE branches (
    id               UUID         PRIMARY KEY,
    code             VARCHAR(20)  NOT NULL,
    name             VARCHAR(120) NOT NULL,
    address          VARCHAR(255),
    city_code        VARCHAR(5),
    phone            VARCHAR(30),
    active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_branches_code UNIQUE (code)
);

CREATE TABLE cash_registers (
    id               UUID         PRIMARY KEY,
    branch_id        UUID         NOT NULL REFERENCES branches (id),
    code             VARCHAR(20)  NOT NULL,
    name             VARCHAR(120) NOT NULL,
    active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_cash_registers_code UNIQUE (branch_id, code)
);

-- Copia mínima del usuario de plataforma (id = platform.users.id). Sin credenciales.
CREATE TABLE members (
    id                 UUID         PRIMARY KEY,
    display_name       VARCHAR(150) NOT NULL,
    default_branch_id  UUID         REFERENCES branches (id),
    active             BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ  NOT NULL,
    created_by         UUID,
    updated_at         TIMESTAMPTZ  NOT NULL,
    updated_by         UUID,
    version            BIGINT       NOT NULL
);

CREATE TABLE roles (
    id               UUID         PRIMARY KEY,
    code             VARCHAR(40)  NOT NULL,
    name             VARCHAR(100) NOT NULL,
    description      VARCHAR(255),
    system_role      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_roles_code UNIQUE (code)
);

CREATE TABLE permissions (
    code             VARCHAR(60)  PRIMARY KEY,
    module           VARCHAR(40)  NOT NULL,
    description      VARCHAR(255) NOT NULL,
    CONSTRAINT ck_permissions_format CHECK (code ~ '^[a-z][a-z-]*:[a-z][a-z-]*$')
);

CREATE TABLE role_permissions (
    role_id          UUID         NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_code  VARCHAR(60)  NOT NULL REFERENCES permissions (code),
    PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE member_roles (
    member_id        UUID         NOT NULL REFERENCES members (id),
    role_id          UUID         NOT NULL REFERENCES roles (id),
    PRIMARY KEY (member_id, role_id)
);

CREATE TABLE member_branches (
    member_id        UUID         NOT NULL REFERENCES members (id),
    branch_id        UUID         NOT NULL REFERENCES branches (id),
    PRIMARY KEY (member_id, branch_id)
);

-- Auditoría (solo inserción)
CREATE TABLE audit_log (
    id               UUID         PRIMARY KEY,
    actor_id         UUID,
    action           VARCHAR(60)  NOT NULL,
    entity           VARCHAR(60)  NOT NULL,
    entity_id        VARCHAR(64),
    before_data      JSONB,
    after_data       JSONB,
    ip               VARCHAR(45),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_log_entity ON audit_log (entity, entity_id);
