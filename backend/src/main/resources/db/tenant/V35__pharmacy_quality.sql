-- =====================================================================
-- Fase 13-6 (decisión 287): calidad de la droguería.
--   * Puntos de control (el local con su termohigrómetro y la nevera de cadena de frío, 2 a 8 °C) con sus rangos.
--   * Lecturas dos veces al día (mañana y tarde). Una lectura fuera de rango exige anotar qué se hizo. No se cambian ni
--     se borran (lo exige la inspección): un error se aclara en la lectura siguiente.
--   * Eventos adversos: el registro de la droguería (el reporte se hace en la página del INVIMA, FOREAM).
--   * Permiso pharmacy:quality (solo con el módulo Medicamentos).
-- =====================================================================

INSERT INTO permissions (code, module, description) VALUES
    ('pharmacy:quality', 'pharmacy', 'Registrar temperatura y humedad y eventos adversos; ver el informe para la visita');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'pharmacy:quality' FROM roles r
WHERE r.code IN ('OWNER', 'ADMIN', 'PHARMACIST', 'PHARMACY_ASSISTANT') AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'pharmacy:quality');

CREATE TABLE quality_points (
    id            UUID          PRIMARY KEY,
    branch_id     UUID          NOT NULL REFERENCES branches (id),
    name          VARCHAR(60)   NOT NULL,
    kind          VARCHAR(10)   NOT NULL,
    temp_min      NUMERIC(4, 1) NOT NULL,
    temp_max      NUMERIC(4, 1) NOT NULL,
    humidity_min  NUMERIC(4, 1),
    humidity_max  NUMERIC(4, 1),
    active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL,
    created_by    UUID,
    updated_at    TIMESTAMPTZ   NOT NULL,
    updated_by    UUID,
    version       BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_quality_points_kind CHECK (kind IN ('ROOM', 'FRIDGE')),
    CONSTRAINT ck_quality_points_temp CHECK (temp_min < temp_max),
    CONSTRAINT ck_quality_points_humidity CHECK (
        (humidity_min IS NULL AND humidity_max IS NULL)
        OR (humidity_min IS NOT NULL AND humidity_max IS NOT NULL AND humidity_min >= 0 AND humidity_max <= 100
            AND humidity_min < humidity_max))
);
CREATE UNIQUE INDEX uq_quality_points_name ON quality_points (branch_id, lower(name));

CREATE TABLE quality_readings (
    id            UUID          PRIMARY KEY,
    point_id      UUID          NOT NULL REFERENCES quality_points (id),
    branch_id     UUID          NOT NULL REFERENCES branches (id),
    reading_date  DATE          NOT NULL,
    shift         VARCHAR(10)   NOT NULL,
    temperature   NUMERIC(4, 1) NOT NULL,
    humidity      NUMERIC(4, 1),
    temp_min      NUMERIC(4, 1) NOT NULL,
    temp_max      NUMERIC(4, 1) NOT NULL,
    humidity_min  NUMERIC(4, 1),
    humidity_max  NUMERIC(4, 1),
    out_of_range  BOOLEAN       NOT NULL,
    action_taken  VARCHAR(300),
    recorded_by   UUID          NOT NULL,
    recorded_at   TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_quality_readings_shift CHECK (shift IN ('MORNING', 'AFTERNOON')),
    CONSTRAINT ck_quality_readings_action CHECK (NOT out_of_range OR action_taken IS NOT NULL),
    CONSTRAINT ck_quality_readings_humidity CHECK (humidity IS NULL OR (humidity >= 0 AND humidity <= 100)),
    CONSTRAINT uq_quality_readings_shift UNIQUE (point_id, reading_date, shift)
);
CREATE INDEX ix_quality_readings_branch_date ON quality_readings (branch_id, reading_date);

-- Las lecturas no se cambian ni se borran.
CREATE FUNCTION quality_readings_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Las lecturas de temperatura y humedad no se modifican ni se borran';
END;
$$;
CREATE TRIGGER trg_quality_readings_immutable BEFORE UPDATE OR DELETE ON quality_readings
    FOR EACH ROW EXECUTE FUNCTION quality_readings_immutable();

CREATE SEQUENCE adverse_event_seq;

CREATE TABLE adverse_events (
    id                  UUID          PRIMARY KEY,
    number              BIGINT        NOT NULL,
    branch_id           UUID          NOT NULL REFERENCES branches (id),
    occurred_on         DATE          NOT NULL,
    patient_name        VARCHAR(160)  NOT NULL,
    patient_document    VARCHAR(20),
    patient_age         INTEGER,
    product_id          UUID          REFERENCES products (id),
    product_name        VARCHAR(200)  NOT NULL,
    lot_number          VARCHAR(40),
    description         VARCHAR(1000) NOT NULL,
    serious             BOOLEAN       NOT NULL,
    reported_on         DATE,
    invima_reference    VARCHAR(60),
    recorded_by         UUID          NOT NULL,
    recorded_at         TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    updated_by          UUID,
    version             BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_adverse_events_age CHECK (patient_age IS NULL OR (patient_age >= 0 AND patient_age <= 130)),
    CONSTRAINT uq_adverse_events_number UNIQUE (number)
);
CREATE INDEX ix_adverse_events_branch_date ON adverse_events (branch_id, occurred_on);
