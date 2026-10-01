-- =====================================================================
-- Fase 3: catálogo (categorías, unidades, impuestos, productos, códigos de
-- barras, presentaciones, listas de precios) y terceros (clientes, proveedores).
-- =====================================================================

CREATE TABLE categories (
    id               UUID         PRIMARY KEY,
    parent_id        UUID         REFERENCES categories (id),
    name             VARCHAR(120) NOT NULL,
    active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT ck_categories_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);
-- Nombre único entre hermanas (sin distinguir mayúsculas).
CREATE UNIQUE INDEX uq_categories_name ON categories (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'), lower(name));

CREATE TABLE units (
    id               UUID         PRIMARY KEY,
    code             VARCHAR(10)  NOT NULL,
    name             VARCHAR(60)  NOT NULL,
    allows_decimals  BOOLEAN      NOT NULL DEFAULT FALSE,
    active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_units_code UNIQUE (code),
    CONSTRAINT ck_units_code CHECK (code ~ '^[A-Z0-9]{1,10}$')
);

CREATE TABLE taxes (
    id               UUID         PRIMARY KEY,
    code             VARCHAR(20)  NOT NULL,
    name             VARCHAR(60)  NOT NULL,
    type             VARCHAR(20)  NOT NULL,
    rate             NUMERIC(5,2) NOT NULL,
    active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_taxes_code UNIQUE (code),
    CONSTRAINT ck_taxes_type CHECK (type IN ('IVA', 'INC', 'EXEMPT', 'EXCLUDED')),
    CONSTRAINT ck_taxes_rate CHECK (rate >= 0 AND rate <= 100),
    CONSTRAINT ck_taxes_zero CHECK (type NOT IN ('EXEMPT', 'EXCLUDED') OR rate = 0)
);

CREATE TABLE products (
    id               UUID          PRIMARY KEY,
    sku              VARCHAR(40)   NOT NULL,
    name             VARCHAR(200)  NOT NULL,
    description      VARCHAR(500),
    category_id      UUID          REFERENCES categories (id),
    base_unit_id     UUID          NOT NULL REFERENCES units (id),
    tax_id           UUID          NOT NULL REFERENCES taxes (id),
    cost             NUMERIC(14,2) NOT NULL DEFAULT 0,
    sale_price       NUMERIC(14,2) NOT NULL,
    track_inventory  BOOLEAN       NOT NULL DEFAULT TRUE,
    tracks_lots      BOOLEAN       NOT NULL DEFAULT FALSE,
    active           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ   NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ   NOT NULL,
    updated_by       UUID,
    version          BIGINT        NOT NULL,
    CONSTRAINT ck_products_cost CHECK (cost >= 0),
    CONSTRAINT ck_products_price CHECK (sale_price >= 0)
);
CREATE UNIQUE INDEX uq_products_sku ON products (upper(sku));
CREATE INDEX ix_products_name ON products (lower(name));
CREATE INDEX ix_products_category ON products (category_id);

-- Presentaciones: p. ej. CAJA = 24 UND. Precio nulo = precio base × factor.
CREATE TABLE product_unit_conversions (
    id               UUID          PRIMARY KEY,
    product_id       UUID          NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    unit_id          UUID          NOT NULL REFERENCES units (id),
    factor           NUMERIC(14,4) NOT NULL,
    sale_price       NUMERIC(14,2),
    CONSTRAINT uq_conversions_unit UNIQUE (product_id, unit_id),
    CONSTRAINT ck_conversions_factor CHECK (factor > 0),
    CONSTRAINT ck_conversions_price CHECK (sale_price IS NULL OR sale_price >= 0)
);

-- Todos los códigos de barras del negocio, únicos. unit_id nulo = unidad base del producto;
-- si no, el código identifica una presentación (debe existir la conversión).
CREATE TABLE product_barcodes (
    id               UUID         PRIMARY KEY,
    product_id       UUID         NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    unit_id          UUID         REFERENCES units (id),
    barcode          VARCHAR(48)  NOT NULL,
    internal         BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_product_barcodes UNIQUE (barcode),
    CONSTRAINT ck_product_barcodes_format CHECK (barcode ~ '^[A-Za-z0-9.\-]{1,48}$')
);
CREATE INDEX ix_product_barcodes_product ON product_barcodes (product_id);

-- Secuencia para códigos EAN-13 internos (prefijo 29).
CREATE SEQUENCE internal_barcode_seq START WITH 1 MINVALUE 1 MAXVALUE 9999999999;

CREATE TABLE price_lists (
    id               UUID         PRIMARY KEY,
    code             VARCHAR(20)  NOT NULL,
    name             VARCHAR(80)  NOT NULL,
    is_default       BOOLEAN      NOT NULL DEFAULT FALSE,
    active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ  NOT NULL,
    updated_by       UUID,
    version          BIGINT       NOT NULL,
    CONSTRAINT uq_price_lists_code UNIQUE (code)
);
CREATE UNIQUE INDEX uq_price_lists_default ON price_lists (is_default) WHERE is_default;

-- Precios de listas distintas de la General (la General es el precio del producto y sus presentaciones).
CREATE TABLE price_list_items (
    price_list_id    UUID          NOT NULL REFERENCES price_lists (id) ON DELETE CASCADE,
    product_id       UUID          NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    unit_id          UUID          NOT NULL REFERENCES units (id),
    price            NUMERIC(14,2) NOT NULL,
    PRIMARY KEY (price_list_id, product_id, unit_id),
    CONSTRAINT ck_price_list_items_price CHECK (price >= 0)
);
CREATE INDEX ix_price_list_items_product ON price_list_items (product_id);

-- Lotes: la tabla existe desde el MVP; la lógica FEFO llega con PHARMACY.
CREATE TABLE lots (
    id               UUID         PRIMARY KEY,
    product_id       UUID         NOT NULL REFERENCES products (id),
    lot_number       VARCHAR(40)  NOT NULL,
    expiration_date  DATE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_lots UNIQUE (product_id, lot_number)
);

-- ------------------------------------------------------------- Terceros
CREATE TABLE parties (
    id                  UUID         PRIMARY KEY,
    person_type         VARCHAR(10)  NOT NULL,
    document_type       VARCHAR(10)  NOT NULL,
    document_number     VARCHAR(20)  NOT NULL,
    verification_digit  INTEGER,
    first_names         VARCHAR(100),
    last_names          VARCHAR(100),
    business_name       VARCHAR(200),
    email               VARCHAR(255),
    phone               VARCHAR(30),
    address             VARCHAR(255),
    city_code           VARCHAR(5),
    system_party        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL,
    created_by          UUID,
    updated_at          TIMESTAMPTZ  NOT NULL,
    updated_by          UUID,
    version             BIGINT       NOT NULL,
    CONSTRAINT uq_parties_document UNIQUE (document_type, document_number),
    CONSTRAINT ck_parties_person_type CHECK (person_type IN ('NATURAL', 'LEGAL')),
    CONSTRAINT ck_parties_document_type CHECK (document_type IN ('CC', 'CE', 'NIT', 'PASSPORT', 'TI', 'PEP')),
    CONSTRAINT ck_parties_names CHECK (
        (person_type = 'NATURAL' AND first_names IS NOT NULL AND last_names IS NOT NULL)
        OR (person_type = 'LEGAL' AND business_name IS NOT NULL)),
    CONSTRAINT ck_parties_legal_nit CHECK (person_type = 'NATURAL' OR document_type = 'NIT'),
    CONSTRAINT ck_parties_dv CHECK (
        (document_type = 'NIT' AND verification_digit BETWEEN 0 AND 9)
        OR (document_type <> 'NIT' AND verification_digit IS NULL))
);
CREATE INDEX ix_parties_names ON parties (lower(coalesce(business_name, first_names || ' ' || last_names)));

CREATE TABLE customers (
    party_id         UUID          PRIMARY KEY REFERENCES parties (id),
    price_list_id    UUID          REFERENCES price_lists (id),
    credit_limit     NUMERIC(14,2) NOT NULL DEFAULT 0,
    active           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ   NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ   NOT NULL,
    updated_by       UUID,
    version          BIGINT        NOT NULL,
    CONSTRAINT ck_customers_credit CHECK (credit_limit >= 0)
);

CREATE TABLE suppliers (
    party_id         UUID          PRIMARY KEY REFERENCES parties (id),
    active           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ   NOT NULL,
    created_by       UUID,
    updated_at       TIMESTAMPTZ   NOT NULL,
    updated_by       UUID,
    version          BIGINT        NOT NULL
);
