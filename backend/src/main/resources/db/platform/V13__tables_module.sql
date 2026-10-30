-- =====================================================================
-- Fase 12b-2 (decisión 269): módulo de mesas y cuentas abiertas (TABLES). Los negocios existentes no lo tienen
-- encendido; Restaurante lo trae por defecto.
-- =====================================================================

ALTER TABLE platform.tenants DROP CONSTRAINT ck_tenants_modules;
ALTER TABLE platform.tenants
    ADD CONSTRAINT ck_tenants_modules CHECK (modules ~
        '^((CREDIT|ORDERS|QUOTES|VARIANTS|SCALE|MODIFIERS|TABLES)(,(CREDIT|ORDERS|QUOTES|VARIANTS|SCALE|MODIFIERS|TABLES))*)?$');
