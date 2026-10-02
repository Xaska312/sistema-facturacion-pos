-- =====================================================================
-- Fase 2: catálogo DIVIPOLA (departamentos y municipios) e invitaciones.
-- =====================================================================

CREATE TABLE platform.departments (
    code   VARCHAR(2)   PRIMARY KEY,
    name   VARCHAR(120) NOT NULL,
    CONSTRAINT ck_departments_code CHECK (code ~ '^[0-9]{2}$')
);

CREATE TABLE platform.cities (
    code             VARCHAR(5)   PRIMARY KEY,
    department_code  VARCHAR(2)   NOT NULL REFERENCES platform.departments (code),
    name             VARCHAR(120) NOT NULL,
    CONSTRAINT ck_cities_code CHECK (code ~ '^[0-9]{5}$' AND left(code, 2) = department_code)
);
CREATE INDEX ix_cities_department ON platform.cities (department_code, name);

-- Los 33 departamentos (32 + Bogotá D.C.) según DIVIPOLA del DANE.
INSERT INTO platform.departments (code, name) VALUES
    ('05', 'Antioquia'), ('08', 'Atlántico'), ('11', 'Bogotá, D.C.'), ('13', 'Bolívar'),
    ('15', 'Boyacá'), ('17', 'Caldas'), ('18', 'Caquetá'), ('19', 'Cauca'), ('20', 'Cesar'),
    ('23', 'Córdoba'), ('25', 'Cundinamarca'), ('27', 'Chocó'), ('41', 'Huila'), ('44', 'La Guajira'),
    ('47', 'Magdalena'), ('50', 'Meta'), ('52', 'Nariño'), ('54', 'Norte de Santander'), ('63', 'Quindío'),
    ('66', 'Risaralda'), ('68', 'Santander'), ('70', 'Sucre'), ('73', 'Tolima'), ('76', 'Valle del Cauca'),
    ('81', 'Arauca'), ('85', 'Casanare'), ('86', 'Putumayo'),
    ('88', 'Archipiélago de San Andrés, Providencia y Santa Catalina'),
    ('91', 'Amazonas'), ('94', 'Guainía'), ('95', 'Guaviare'), ('97', 'Vaupés'), ('99', 'Vichada');

-- Capitales. El listado completo de municipios se carga en una migración posterior
-- generada desde el archivo oficial del DANE (ver docs/DECISIONES.md).
INSERT INTO platform.cities (code, department_code, name) VALUES
    ('05001', '05', 'Medellín'), ('08001', '08', 'Barranquilla'), ('11001', '11', 'Bogotá, D.C.'),
    ('13001', '13', 'Cartagena de Indias'), ('15001', '15', 'Tunja'), ('17001', '17', 'Manizales'),
    ('18001', '18', 'Florencia'), ('19001', '19', 'Popayán'), ('20001', '20', 'Valledupar'),
    ('23001', '23', 'Montería'), ('27001', '27', 'Quibdó'), ('41001', '41', 'Neiva'),
    ('44001', '44', 'Riohacha'), ('47001', '47', 'Santa Marta'), ('50001', '50', 'Villavicencio'),
    ('52001', '52', 'Pasto'), ('54001', '54', 'San José de Cúcuta'), ('63001', '63', 'Armenia'),
    ('66001', '66', 'Pereira'), ('68001', '68', 'Bucaramanga'), ('70001', '70', 'Sincelejo'),
    ('73001', '73', 'Ibagué'), ('76001', '76', 'Cali'), ('81001', '81', 'Arauca'),
    ('85001', '85', 'Yopal'), ('86001', '86', 'Mocoa'), ('88001', '88', 'San Andrés'),
    ('91001', '91', 'Leticia'), ('94001', '94', 'Inírida'), ('95001', '95', 'San José del Guaviare'),
    ('97001', '97', 'Mitú'), ('99001', '99', 'Puerto Carreño');

-- Invitaciones a un negocio por enlace. El token se entrega una sola vez y se guarda hasheado.
-- Roles y sucursales referencian tablas del schema del negocio (sin FK entre schemas):
-- se validan al crear y al aceptar.
CREATE TABLE platform.invitations (
    id               UUID         PRIMARY KEY,
    tenant_id        UUID         NOT NULL REFERENCES platform.tenants (id),
    email            VARCHAR(255) NOT NULL,
    token_hash       VARCHAR(64)  NOT NULL,
    status           VARCHAR(20)  NOT NULL,
    expires_at       TIMESTAMPTZ  NOT NULL,
    invited_by       UUID         NOT NULL REFERENCES platform.users (id),
    accepted_by      UUID         REFERENCES platform.users (id),
    accepted_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_invitations_token UNIQUE (token_hash),
    CONSTRAINT ck_invitations_email_lower CHECK (email = lower(email)),
    CONSTRAINT ck_invitations_status CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED'))
);
-- Una sola invitación pendiente por correo y negocio.
CREATE UNIQUE INDEX uq_invitations_pending ON platform.invitations (tenant_id, email) WHERE status = 'PENDING';
CREATE INDEX ix_invitations_tenant ON platform.invitations (tenant_id, created_at DESC);

CREATE TABLE platform.invitation_roles (
    invitation_id    UUID NOT NULL REFERENCES platform.invitations (id) ON DELETE CASCADE,
    role_id          UUID NOT NULL,
    PRIMARY KEY (invitation_id, role_id)
);

CREATE TABLE platform.invitation_branches (
    invitation_id    UUID NOT NULL REFERENCES platform.invitations (id) ON DELETE CASCADE,
    branch_id        UUID NOT NULL,
    PRIMARY KEY (invitation_id, branch_id)
);
