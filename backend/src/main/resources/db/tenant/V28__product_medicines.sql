-- =====================================================================
-- Fase 13-1 (decisión 279): ficha del medicamento de cada producto (módulo Medicamentos).
--   * Tipo de producto: medicamento, fitoterapéutico, dispositivo médico, cosmético, suplemento dietario u otro.
--   * Registro sanitario INVIMA y CUM (Decreto 677 de 1995), principio activo con su concentración (denominación común
--     internacional, Decreto 780 de 2016 art. 2.5.3.10.15), forma farmacéutica, vía, ATC y titular.
--   * Condición de venta: libre, bajo fórmula médica, control especial o monopolio del Estado (Decreto 780 art.
--     2.5.3.10.18; Resolución 1478 de 2006). Un medicamento o fitoterapéutico siempre la tiene.
--   * Antibiótico: nunca de venta libre (Resolución SDS Bogotá 234 de 2005 y la condición de su registro).
--   * Venta por unidad (decisión del usuario): solo si se marca, y nunca en antibióticos ni control especial; el
--     medicamento se entrega en su envase aprobado (Decreto 677 de 1995 art. 70).
-- =====================================================================

CREATE TABLE product_medicines (
    product_id             UUID           PRIMARY KEY REFERENCES products (id),
    kind                   VARCHAR(20)    NOT NULL,
    sanitary_registration  VARCHAR(80),
    cum                    VARCHAR(30),
    active_ingredients     VARCHAR(1000),
    dosage_form            VARCHAR(200),
    route                  VARCHAR(120),
    atc                    VARCHAR(10),
    holder                 VARCHAR(300),
    sale_condition         VARCHAR(20),
    antibiotic             BOOLEAN        NOT NULL DEFAULT FALSE,
    cold_chain             BOOLEAN        NOT NULL DEFAULT FALSE,
    unit_sale              BOOLEAN        NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ    NOT NULL,
    updated_at             TIMESTAMPTZ    NOT NULL,
    updated_by             UUID           NOT NULL,
    CONSTRAINT ck_product_medicines_kind CHECK (kind IN
        ('MEDICINE', 'PHYTOTHERAPEUTIC', 'MEDICAL_DEVICE', 'COSMETIC', 'SUPPLEMENT', 'OTHER')),
    CONSTRAINT ck_product_medicines_condition CHECK (sale_condition IS NULL OR sale_condition IN
        ('OTC', 'PRESCRIPTION', 'CONTROLLED', 'STATE_MONOPOLY')),
    CONSTRAINT ck_product_medicines_condition_required CHECK (
        kind NOT IN ('MEDICINE', 'PHYTOTHERAPEUTIC') OR sale_condition IS NOT NULL),
    CONSTRAINT ck_product_medicines_antibiotic CHECK (
        NOT antibiotic OR (kind = 'MEDICINE' AND sale_condition <> 'OTC')),
    CONSTRAINT ck_product_medicines_unit_sale CHECK (
        NOT unit_sale OR (NOT antibiotic AND coalesce(sale_condition, 'OTC') NOT IN ('CONTROLLED', 'STATE_MONOPOLY')))
);
CREATE INDEX ix_product_medicines_cum ON product_medicines (cum) WHERE cum IS NOT NULL;
CREATE INDEX ix_product_medicines_condition ON product_medicines (sale_condition);
