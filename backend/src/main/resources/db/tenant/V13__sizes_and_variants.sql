-- Fase 8d: tallas y colores.
-- Un "modelo" (p. ej. Tenis Runner) agrupa sus variantes; cada variante (talla × color) es un producto normal con su
-- SKU, código, existencia y kardex, así ventas, inventario y reportes no cambian. El precio es el del modelo (igual
-- para todas las variantes, decisión del usuario) y se copia a cada variante al guardar el modelo.

CREATE TABLE size_scales (
    id          UUID         PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL,
    name        VARCHAR(60)  NOT NULL,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL,
    created_by  UUID,
    updated_at  TIMESTAMPTZ  NOT NULL,
    updated_by  UUID,
    version     BIGINT       NOT NULL,
    CONSTRAINT uq_size_scales_code UNIQUE (code)
);

-- Tallas de cada escala, en orden. Las equivalencias (otra escala) son texto libre y las edita cada negocio: varían
-- por marca, por eso no se siembran.
CREATE TABLE size_scale_sizes (
    scale_id    UUID         NOT NULL REFERENCES size_scales (id),
    position    INTEGER      NOT NULL,
    label       VARCHAR(10)  NOT NULL,
    equivalent  VARCHAR(40),
    PRIMARY KEY (scale_id, label),
    CONSTRAINT uq_size_scale_sizes_position UNIQUE (scale_id, position)
);

CREATE TABLE product_models (
    id              UUID          PRIMARY KEY,
    sku_prefix      VARCHAR(20)   NOT NULL,
    name            VARCHAR(150)  NOT NULL,
    description     VARCHAR(500),
    category_id     UUID          REFERENCES categories (id),
    tax_id          UUID          NOT NULL REFERENCES taxes (id),
    cost            NUMERIC(14,2) NOT NULL DEFAULT 0,
    sale_price      NUMERIC(14,2) NOT NULL,
    size_scale_id   UUID          NOT NULL REFERENCES size_scales (id),
    active          BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL,
    created_by      UUID,
    updated_at      TIMESTAMPTZ   NOT NULL,
    updated_by      UUID,
    version         BIGINT        NOT NULL,
    CONSTRAINT ck_product_models_cost CHECK (cost >= 0),
    CONSTRAINT ck_product_models_price CHECK (sale_price >= 0)
);
CREATE UNIQUE INDEX uq_product_models_prefix ON product_models (upper(sku_prefix));
CREATE INDEX ix_product_models_name ON product_models (lower(name));

-- Variante = producto con modelo, talla y color (color opcional: un modelo puede tener solo tallas).
ALTER TABLE products ADD COLUMN model_id UUID REFERENCES product_models (id);
ALTER TABLE products ADD COLUMN variant_size VARCHAR(10);
ALTER TABLE products ADD COLUMN variant_color VARCHAR(40);
ALTER TABLE products ADD CONSTRAINT ck_products_variant CHECK (
    (model_id IS NULL AND variant_size IS NULL AND variant_color IS NULL)
    OR (model_id IS NOT NULL AND variant_size IS NOT NULL));
CREATE UNIQUE INDEX uq_products_variant ON products (model_id, variant_size, lower(coalesce(variant_color, '')))
    WHERE model_id IS NOT NULL;
CREATE INDEX ix_products_model ON products (model_id) WHERE model_id IS NOT NULL;

-- Escalas sembradas (cada negocio puede editarlas o crear las suyas).

INSERT INTO size_scales (id, code, name, sort_order, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000001101', 'CALZADO_CO', 'Calzado Colombia', 1, now(), now(), 0);
INSERT INTO size_scale_sizes (scale_id, position, label) VALUES
    ('01920000-0000-7000-8000-000000001101', 1, '34'),
    ('01920000-0000-7000-8000-000000001101', 2, '35'),
    ('01920000-0000-7000-8000-000000001101', 3, '36'),
    ('01920000-0000-7000-8000-000000001101', 4, '37'),
    ('01920000-0000-7000-8000-000000001101', 5, '38'),
    ('01920000-0000-7000-8000-000000001101', 6, '39'),
    ('01920000-0000-7000-8000-000000001101', 7, '40'),
    ('01920000-0000-7000-8000-000000001101', 8, '41'),
    ('01920000-0000-7000-8000-000000001101', 9, '42'),
    ('01920000-0000-7000-8000-000000001101', 10, '43'),
    ('01920000-0000-7000-8000-000000001101', 11, '44'),
    ('01920000-0000-7000-8000-000000001101', 12, '45');

INSERT INTO size_scales (id, code, name, sort_order, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000001102', 'CALZADO_EU', 'Calzado EU', 2, now(), now(), 0);
INSERT INTO size_scale_sizes (scale_id, position, label) VALUES
    ('01920000-0000-7000-8000-000000001102', 1, '35'),
    ('01920000-0000-7000-8000-000000001102', 2, '36'),
    ('01920000-0000-7000-8000-000000001102', 3, '37'),
    ('01920000-0000-7000-8000-000000001102', 4, '38'),
    ('01920000-0000-7000-8000-000000001102', 5, '39'),
    ('01920000-0000-7000-8000-000000001102', 6, '40'),
    ('01920000-0000-7000-8000-000000001102', 7, '41'),
    ('01920000-0000-7000-8000-000000001102', 8, '42'),
    ('01920000-0000-7000-8000-000000001102', 9, '43'),
    ('01920000-0000-7000-8000-000000001102', 10, '44'),
    ('01920000-0000-7000-8000-000000001102', 11, '45'),
    ('01920000-0000-7000-8000-000000001102', 12, '46');

INSERT INTO size_scales (id, code, name, sort_order, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000001103', 'CALZADO_US', 'Calzado US', 3, now(), now(), 0);
INSERT INTO size_scale_sizes (scale_id, position, label) VALUES
    ('01920000-0000-7000-8000-000000001103', 1, '5'),
    ('01920000-0000-7000-8000-000000001103', 2, '5.5'),
    ('01920000-0000-7000-8000-000000001103', 3, '6'),
    ('01920000-0000-7000-8000-000000001103', 4, '6.5'),
    ('01920000-0000-7000-8000-000000001103', 5, '7'),
    ('01920000-0000-7000-8000-000000001103', 6, '7.5'),
    ('01920000-0000-7000-8000-000000001103', 7, '8'),
    ('01920000-0000-7000-8000-000000001103', 8, '8.5'),
    ('01920000-0000-7000-8000-000000001103', 9, '9'),
    ('01920000-0000-7000-8000-000000001103', 10, '9.5'),
    ('01920000-0000-7000-8000-000000001103', 11, '10'),
    ('01920000-0000-7000-8000-000000001103', 12, '10.5'),
    ('01920000-0000-7000-8000-000000001103', 13, '11'),
    ('01920000-0000-7000-8000-000000001103', 14, '11.5'),
    ('01920000-0000-7000-8000-000000001103', 15, '12');

INSERT INTO size_scales (id, code, name, sort_order, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000001104', 'CALZADO_NINO', 'Calzado niño', 4, now(), now(), 0);
INSERT INTO size_scale_sizes (scale_id, position, label) VALUES
    ('01920000-0000-7000-8000-000000001104', 1, '18'),
    ('01920000-0000-7000-8000-000000001104', 2, '19'),
    ('01920000-0000-7000-8000-000000001104', 3, '20'),
    ('01920000-0000-7000-8000-000000001104', 4, '21'),
    ('01920000-0000-7000-8000-000000001104', 5, '22'),
    ('01920000-0000-7000-8000-000000001104', 6, '23'),
    ('01920000-0000-7000-8000-000000001104', 7, '24'),
    ('01920000-0000-7000-8000-000000001104', 8, '25'),
    ('01920000-0000-7000-8000-000000001104', 9, '26'),
    ('01920000-0000-7000-8000-000000001104', 10, '27'),
    ('01920000-0000-7000-8000-000000001104', 11, '28'),
    ('01920000-0000-7000-8000-000000001104', 12, '29'),
    ('01920000-0000-7000-8000-000000001104', 13, '30'),
    ('01920000-0000-7000-8000-000000001104', 14, '31'),
    ('01920000-0000-7000-8000-000000001104', 15, '32'),
    ('01920000-0000-7000-8000-000000001104', 16, '33');

INSERT INTO size_scales (id, code, name, sort_order, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000001105', 'ROPA_LETRAS', 'Ropa (letras)', 5, now(), now(), 0);
INSERT INTO size_scale_sizes (scale_id, position, label) VALUES
    ('01920000-0000-7000-8000-000000001105', 1, 'XS'),
    ('01920000-0000-7000-8000-000000001105', 2, 'S'),
    ('01920000-0000-7000-8000-000000001105', 3, 'M'),
    ('01920000-0000-7000-8000-000000001105', 4, 'L'),
    ('01920000-0000-7000-8000-000000001105', 5, 'XL'),
    ('01920000-0000-7000-8000-000000001105', 6, 'XXL');

INSERT INTO size_scales (id, code, name, sort_order, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000001106', 'ROPA_NINO', 'Ropa niño', 6, now(), now(), 0);
INSERT INTO size_scale_sizes (scale_id, position, label) VALUES
    ('01920000-0000-7000-8000-000000001106', 1, '2'),
    ('01920000-0000-7000-8000-000000001106', 2, '4'),
    ('01920000-0000-7000-8000-000000001106', 3, '6'),
    ('01920000-0000-7000-8000-000000001106', 4, '8'),
    ('01920000-0000-7000-8000-000000001106', 5, '10'),
    ('01920000-0000-7000-8000-000000001106', 6, '12'),
    ('01920000-0000-7000-8000-000000001106', 7, '14'),
    ('01920000-0000-7000-8000-000000001106', 8, '16');

INSERT INTO size_scales (id, code, name, sort_order, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000001107', 'JEAN', 'Jean / pantalón', 7, now(), now(), 0);
INSERT INTO size_scale_sizes (scale_id, position, label) VALUES
    ('01920000-0000-7000-8000-000000001107', 1, '28'),
    ('01920000-0000-7000-8000-000000001107', 2, '30'),
    ('01920000-0000-7000-8000-000000001107', 3, '32'),
    ('01920000-0000-7000-8000-000000001107', 4, '34'),
    ('01920000-0000-7000-8000-000000001107', 5, '36'),
    ('01920000-0000-7000-8000-000000001107', 6, '38'),
    ('01920000-0000-7000-8000-000000001107', 7, '40');
