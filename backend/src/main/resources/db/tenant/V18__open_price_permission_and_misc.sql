-- =====================================================================
-- Precio libre por rol y producto "Varios" (decisión 253).
-- 1. sales:open-price: vender un producto de precio libre escribiendo el precio. Lo reciben los roles del sistema que
--    venden (Propietario, Administrador, Cajero, Vendedor); el dueño puede quitárselo a un rol.
-- 2. "Varios": todo negocio trae un producto de precio libre y sin inventario para vender algo que todavía no está
--    creado sin frenar la fila. Impuesto IVA 19 % (el dueño lo cambia si su caso es otro). Si el negocio ya tiene un
--    producto con SKU VARIOS, no se toca.
-- =====================================================================

INSERT INTO permissions (code, module, description) VALUES
    ('sales:open-price', 'sales', 'Vender productos de precio libre escribiendo el precio');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'sales:open-price' FROM roles r
WHERE r.system_role AND r.code IN ('OWNER', 'ADMIN', 'CASHIER', 'SELLER')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'sales:open-price');

INSERT INTO products (id, sku, name, description, base_unit_id, tax_id, cost, sale_price, track_inventory,
                      open_price, created_at, updated_at, version)
SELECT '01920000-0000-7000-8000-000000000801', 'VARIOS', 'Varios',
       'Para vender algo que aún no está creado: al venderlo escribes el precio.',
       '01920000-0000-7000-8000-000000000301', '01920000-0000-7000-8000-000000000401', 0, 0, FALSE,
       TRUE, now(), now(), 0
WHERE NOT EXISTS (SELECT 1 FROM products WHERE upper(sku) = 'VARIOS')
  AND NOT EXISTS (SELECT 1 FROM products WHERE id = '01920000-0000-7000-8000-000000000801');
