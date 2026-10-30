-- =====================================================================
-- Fase 12b-1 (decisión 268): módulo de adiciones (MODIFIERS). Los negocios existentes no lo tienen encendido: el
-- dueño lo prende en Ajustes → Tipo y módulos (Restaurante lo trae por defecto).
-- =====================================================================

ALTER TABLE platform.tenants DROP CONSTRAINT ck_tenants_modules;
ALTER TABLE platform.tenants
    ADD CONSTRAINT ck_tenants_modules CHECK (modules ~
        '^((CREDIT|ORDERS|QUOTES|VARIANTS|SCALE|MODIFIERS)(,(CREDIT|ORDERS|QUOTES|VARIANTS|SCALE|MODIFIERS))*)?$');
