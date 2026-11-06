-- =====================================================================
-- Decisión 288: planes por nivel con lo que incluye cada uno, y extras que el administrador le da a un negocio.
--   * Emprende ($34.900): lo esencial, 1 sede, 1 caja, 2 usuarios, fiado.
--   * Negocio ($69.900): 1 sede, 3 cajas, 6 usuarios; pedidos, cotizaciones, tallas, báscula, el módulo del sector
--     (mesas y cocina o droguería), compras e impresión directa con cajón.
--   * Empresa ($129.900): hasta 5 sedes, cajas y usuarios sin límite; todo (también auditoría, caja por zona y
--     traslados entre sedes).
--   * Básico y Pro quedan como planes anteriores: con todo lo que tenían, para los clientes de hoy, que conservan su
--     precio 12 meses (price_locked_until).
--   * Extras por negocio: módulos, funciones, sedes, cajas y usuarios de más (con nota y fecha de fin opcional).
-- Precios anuales: 10 meses. Sin IVA (el prestador no es responsable de IVA).
-- =====================================================================

ALTER TABLE platform.plans
    ADD COLUMN max_registers INTEGER,
    ADD COLUMN modules       VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN features      VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN legacy        BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT ck_plans_registers CHECK (max_registers IS NULL OR max_registers >= 1);

UPDATE platform.plans
SET modules = 'CREDIT,ORDERS,QUOTES,VARIANTS,SCALE,MODIFIERS,TABLES,KITCHEN,MEDICINES',
    features = 'PURCHASES,DIRECT_PRINT,AUDIT,TRANSFERS,ZONE_REGISTERS',
    legacy = TRUE, sort_order = sort_order + 10, updated_at = now(),
    name = CASE code WHEN 'BASIC' THEN 'Básico (anterior)' WHEN 'PRO' THEN 'Pro (anterior)' ELSE name END
WHERE code IN ('BASIC', 'PRO');

INSERT INTO platform.plans (code, name, max_branches, max_users, max_registers, monthly_price, annual_price, sort_order,
                            modules, features)
VALUES
    ('EMPRENDE', 'Emprende', 1, 2, 1, 34900, 349000, 1, 'CREDIT', ''),
    ('NEGOCIO', 'Negocio', 1, 6, 3, 69900, 699000, 2,
     'CREDIT,ORDERS,QUOTES,VARIANTS,SCALE,MODIFIERS,TABLES,KITCHEN,MEDICINES', 'PURCHASES,DIRECT_PRINT'),
    ('EMPRESA', 'Empresa', 5, NULL, NULL, 129900, 1299000, 3,
     'CREDIT,ORDERS,QUOTES,VARIANTS,SCALE,MODIFIERS,TABLES,KITCHEN,MEDICINES',
     'PURCHASES,DIRECT_PRINT,AUDIT,TRANSFERS,ZONE_REGISTERS');

ALTER TABLE platform.subscriptions
    ADD COLUMN extra_modules      VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN extra_features     VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN extra_branches     INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN extra_registers    INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN extra_users        INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN extras_note        VARCHAR(300),
    ADD COLUMN extras_until       TIMESTAMPTZ,
    ADD COLUMN price_locked_until TIMESTAMPTZ,
    ADD CONSTRAINT ck_subscriptions_extras CHECK (extra_branches BETWEEN 0 AND 100 AND extra_registers BETWEEN 0 AND 100
        AND extra_users BETWEEN 0 AND 500);

-- Los clientes de hoy conservan lo que tienen y su precio por 12 meses.
UPDATE platform.subscriptions SET price_locked_until = now() + INTERVAL '12 months', updated_at = now();
