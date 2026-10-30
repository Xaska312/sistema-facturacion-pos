-- =====================================================================
-- Fase 12b-3 (decisión 270): módulo de cocina y comandas (KITCHEN). Necesita Mesas. Los restaurantes piloto que ya
-- tienen Mesas lo reciben encendido; los demás negocios no.
-- =====================================================================

ALTER TABLE platform.tenants DROP CONSTRAINT ck_tenants_modules;
ALTER TABLE platform.tenants
    ADD CONSTRAINT ck_tenants_modules CHECK (modules ~
        '^((CREDIT|ORDERS|QUOTES|VARIANTS|SCALE|MODIFIERS|TABLES|KITCHEN)(,(CREDIT|ORDERS|QUOTES|VARIANTS|SCALE|MODIFIERS|TABLES|KITCHEN))*)?$');

UPDATE platform.tenants
SET modules = modules || ',KITCHEN'
WHERE business_type = 'RESTAURANT'
  AND modules ~ '(^|,)TABLES(,|$)'
  AND modules !~ '(^|,)KITCHEN(,|$)';
