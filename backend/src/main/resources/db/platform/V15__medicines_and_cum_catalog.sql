-- =====================================================================
-- Fase 13-1 (decisión 279): módulo Medicamentos (MEDICINES) y catálogo compartido del Código Único de Medicamentos
-- (CUM) del INVIMA. Los negocios tipo Farmacia lo reciben encendido.
--   * El catálogo es de todos los negocios: el administrador de plataforma lo carga desde el CSV de datos.gov.co
--     ("CÓDIGO ÚNICO DE MEDICAMENTOS VIGENTES"). Una fila por presentación (CUM = expediente-consecutivo) activa y que
--     no es muestra médica; los principios activos de las filas del mismo CUM quedan juntos en una sola columna.
--   * Cada carga marca sus filas con su id; al terminar se quitan las presentaciones que ya no vinieron.
-- =====================================================================

ALTER TABLE platform.tenants DROP CONSTRAINT ck_tenants_modules;
ALTER TABLE platform.tenants
    ADD CONSTRAINT ck_tenants_modules CHECK (modules ~
        '^((CREDIT|ORDERS|QUOTES|VARIANTS|SCALE|MODIFIERS|TABLES|KITCHEN|MEDICINES)(,(CREDIT|ORDERS|QUOTES|VARIANTS|SCALE|MODIFIERS|TABLES|KITCHEN|MEDICINES))*)?$');

UPDATE platform.tenants
SET modules = CASE WHEN modules = '' THEN 'MEDICINES' ELSE modules || ',MEDICINES' END
WHERE business_type = 'PHARMACY'
  AND modules !~ '(^|,)MEDICINES(,|$)';

CREATE TABLE platform.cum_imports (
    id             UUID          PRIMARY KEY,
    status         VARCHAR(12)   NOT NULL,
    source_name    VARCHAR(200),
    started_by     UUID          NOT NULL,
    started_at     TIMESTAMPTZ   NOT NULL,
    finished_at    TIMESTAMPTZ,
    rows_received  INTEGER       NOT NULL DEFAULT 0,
    total          INTEGER,
    removed        INTEGER,
    CONSTRAINT ck_cum_imports_status CHECK (status IN ('RUNNING', 'DONE'))
);

CREATE TABLE platform.cum_catalog (
    cum                    VARCHAR(30)    PRIMARY KEY,
    expediente             VARCHAR(20)    NOT NULL,
    consecutivo            INTEGER        NOT NULL,
    product_name           VARCHAR(400)   NOT NULL,
    holder                 VARCHAR(300),
    sanitary_registration  VARCHAR(80),
    presentation           VARCHAR(1000),
    atc                    VARCHAR(10),
    atc_description        VARCHAR(300),
    route                  VARCHAR(120),
    dosage_form            VARCHAR(200),
    active_ingredients     VARCHAR(1000)  NOT NULL,
    ium                    VARCHAR(40),
    -- Nombre, principios activos, CUM, registro y titular en minúsculas y sin tildes, para buscar.
    search_text            VARCHAR(3000)  NOT NULL,
    import_id              UUID           NOT NULL REFERENCES platform.cum_imports (id),
    updated_at             TIMESTAMPTZ    NOT NULL
);
CREATE INDEX ix_cum_catalog_import ON platform.cum_catalog (import_id);
CREATE INDEX ix_cum_catalog_expediente ON platform.cum_catalog (expediente);
