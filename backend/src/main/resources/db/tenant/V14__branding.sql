-- Fase 8c: marca del negocio. Una sola fila: color de una paleta cerrada (contraste revisado en claro y oscuro) y
-- logo pequeño (PNG, JPEG o WebP; el navegador lo reduce antes de subirlo). Sin SVG: puede llevar scripts.
CREATE TABLE business_branding (
    id          SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    brand_color VARCHAR(20)  NOT NULL DEFAULT 'turquesa',
    logo        BYTEA,
    logo_type   VARCHAR(20),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by  UUID,
    CONSTRAINT ck_branding_color CHECK (brand_color IN
        ('turquesa', 'azul', 'indigo', 'violeta', 'rosa', 'naranja', 'verde', 'grafito')),
    CONSTRAINT ck_branding_logo CHECK (
        (logo IS NULL AND logo_type IS NULL)
        OR (logo IS NOT NULL AND logo_type IS NOT NULL AND logo_type IN ('image/png', 'image/jpeg', 'image/webp')
            AND octet_length(logo) BETWEEN 1 AND 153600))
);

INSERT INTO business_branding (id) VALUES (1);
