-- =====================================================================
-- Fase 12a (decisión 267): módulos encendidos de cada negocio. El tipo (business_type) ya existía. Los negocios que
-- ya existen son Comercio y quedan con todos los módulos, como hasta ahora. Apagar un módulo no borra sus datos.
-- =====================================================================

ALTER TABLE platform.tenants
    ADD COLUMN modules VARCHAR(200) NOT NULL DEFAULT 'CREDIT,ORDERS,QUOTES,SCALE,VARIANTS';

-- Solo códigos conocidos, separados por coma y sin espacios (o vacío: ningún módulo opcional).
ALTER TABLE platform.tenants
    ADD CONSTRAINT ck_tenants_modules CHECK (modules ~ '^((CREDIT|ORDERS|QUOTES|VARIANTS|SCALE)(,(CREDIT|ORDERS|QUOTES|VARIANTS|SCALE))*)?$');
