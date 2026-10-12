-- Fase 8e: etiquetas de báscula etiquetadora (EAN-13 que empieza por 2: prefijo + PLU + peso o precio + dígito de
-- control). Una fila con el formato que usa la báscula del negocio y la tabla PLU → producto.
CREATE TABLE scale_settings (
    id             SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
    prefix         VARCHAR(2)  NOT NULL DEFAULT '20',
    plu_digits     SMALLINT    NOT NULL DEFAULT 5,
    value_kind     VARCHAR(10) NOT NULL DEFAULT 'WEIGHT',
    value_decimals SMALLINT    NOT NULL DEFAULT 3,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_scale_prefix CHECK (prefix ~ '^2[0-8]?$'),
    CONSTRAINT ck_scale_kind CHECK (value_kind IN ('WEIGHT', 'PRICE')),
    -- El valor ocupa lo que queda de los 12 dígitos (sin el de control): entre 4 y 7.
    CONSTRAINT ck_scale_digits CHECK (plu_digits BETWEEN 3 AND 6
        AND 12 - length(prefix) - plu_digits BETWEEN 4 AND 7),
    CONSTRAINT ck_scale_decimals CHECK (value_decimals BETWEEN 0 AND 3)
);

INSERT INTO scale_settings (id) VALUES (1);

-- PLU sin ceros a la izquierda ("00123" y "123" son el mismo). Un producto tiene a lo sumo un PLU.
CREATE TABLE scale_plus (
    plu        VARCHAR(6)  PRIMARY KEY CHECK (plu ~ '^[1-9][0-9]{0,5}$'),
    product_id UUID        NOT NULL UNIQUE REFERENCES products (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
