-- =====================================================================
-- Datos base de todo negocio nuevo (Fase 1).
-- IDs fijos por schema: cada negocio tiene su propia copia.
-- =====================================================================

-- Catálogo de permisos (recurso:acción). Los de módulos futuros se siembran
-- desde ya para que los roles por defecto queden completos.
INSERT INTO permissions (code, module, description) VALUES
    ('settings:read',          'organization', 'Ver la configuración del negocio'),
    ('settings:manage',        'organization', 'Modificar la configuración del negocio'),
    ('branches:read',          'organization', 'Ver sucursales'),
    ('branches:manage',        'organization', 'Crear y editar sucursales'),
    ('cash-registers:manage',  'organization', 'Crear y editar cajas registradoras'),
    ('members:read',           'access',       'Ver usuarios del negocio'),
    ('members:manage',         'access',       'Invitar, bloquear y asignar roles a usuarios'),
    ('roles:manage',           'access',       'Crear y editar roles y permisos'),
    ('products:read',          'catalog',      'Ver productos'),
    ('products:manage',        'catalog',      'Crear y editar productos, categorías, impuestos y precios'),
    ('parties:read',           'parties',      'Ver clientes y proveedores'),
    ('parties:manage',         'parties',      'Crear y editar clientes y proveedores'),
    ('inventory:read',         'inventory',    'Ver existencias y kardex'),
    ('inventory:adjust',       'inventory',    'Registrar ajustes de inventario'),
    ('inventory:transfer',     'inventory',    'Registrar traslados entre sucursales'),
    ('cash:operate',           'cash',         'Abrir, mover y cerrar caja'),
    ('cash:read',              'cash',         'Ver sesiones y arqueos de caja'),
    ('sales:create',           'sales',        'Registrar ventas'),
    ('sales:read',             'sales',        'Ver ventas'),
    ('sales:void',             'sales',        'Anular ventas'),
    ('sales:discount',         'sales',        'Aplicar descuentos por encima del límite'),
    ('reports:read',           'reporting',    'Ver reportes');

INSERT INTO roles (id, code, name, description, system_role, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000000001', 'OWNER',      'Propietario',   'Acceso total al negocio',                        TRUE, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000002', 'ADMIN',      'Administrador', 'Administra el negocio',                          TRUE, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000003', 'CASHIER',    'Cajero',        'Opera caja y registra ventas',                   TRUE, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000004', 'SELLER',     'Vendedor',      'Registra ventas y consulta productos',           TRUE, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000005', 'WAREHOUSE',  'Bodeguero',     'Gestiona inventario',                            TRUE, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000006', 'ACCOUNTANT', 'Contador',      'Consulta ventas, caja y reportes',               TRUE, now(), now(), 0);

-- OWNER y ADMIN: todos los permisos
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN permissions p WHERE r.code IN ('OWNER', 'ADMIN');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
JOIN (VALUES
    ('CASHIER',    'branches:read'), ('CASHIER', 'products:read'), ('CASHIER', 'parties:read'),
    ('CASHIER',    'parties:manage'), ('CASHIER', 'inventory:read'), ('CASHIER', 'cash:operate'),
    ('CASHIER',    'cash:read'), ('CASHIER', 'sales:create'), ('CASHIER', 'sales:read'),
    ('SELLER',     'branches:read'), ('SELLER', 'products:read'), ('SELLER', 'parties:read'),
    ('SELLER',     'inventory:read'), ('SELLER', 'sales:create'), ('SELLER', 'sales:read'),
    ('WAREHOUSE',  'branches:read'), ('WAREHOUSE', 'products:read'), ('WAREHOUSE', 'products:manage'),
    ('WAREHOUSE',  'inventory:read'), ('WAREHOUSE', 'inventory:adjust'), ('WAREHOUSE', 'inventory:transfer'),
    ('ACCOUNTANT', 'branches:read'), ('ACCOUNTANT', 'settings:read'), ('ACCOUNTANT', 'products:read'),
    ('ACCOUNTANT', 'parties:read'), ('ACCOUNTANT', 'inventory:read'), ('ACCOUNTANT', 'cash:read'),
    ('ACCOUNTANT', 'sales:read'), ('ACCOUNTANT', 'reports:read')
) AS m(role_code, permission_code) ON m.role_code = r.code
JOIN permissions p ON p.code = m.permission_code;

INSERT INTO branches (id, code, name, active, created_at, updated_at, version)
VALUES ('01920000-0000-7000-8000-000000000101', 'PRINCIPAL', 'Sede principal', TRUE, now(), now(), 0);

INSERT INTO cash_registers (id, branch_id, code, name, active, created_at, updated_at, version)
VALUES ('01920000-0000-7000-8000-000000000201', '01920000-0000-7000-8000-000000000101', 'CAJA-1', 'Caja principal', TRUE, now(), now(), 0);

INSERT INTO business_settings (setting_key, setting_value, value_type) VALUES
    ('allow_negative_stock', 'false',           'BOOLEAN'),
    ('prices_include_tax',   'true',            'BOOLEAN'),
    ('timezone',             'America/Bogota',  'STRING'),
    ('currency',             'COP',             'STRING'),
    ('receipt_footer',       'Gracias por su compra', 'STRING'),
    ('max_discount_percent', '0',               'DECIMAL');
