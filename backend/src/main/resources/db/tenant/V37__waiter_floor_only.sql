-- Decisión 293: el Mesero solo atiende mesas (abre, pide, envía a cocina y entrega); cobra la caja. Antes (decisión 270)
-- también cobraba con su caja y veía productos, clientes, existencias y sus ventas. Solo se cambia el rol si sigue
-- exactamente como lo dejó XASKA: si el dueño ya lo editó, se respeta lo que hizo. Para pedir le basta ver los
-- productos (products:read) y el precio vigente (GET /sales/price admite tables:operate desde esta versión).

UPDATE roles r
SET description = 'Atiende mesas: abre cuentas, pide, envía a cocina y entrega; no cobra (el dueño le puede dar Vender)',
    updated_at = now(), version = version + 1
WHERE r.code = 'WAITER' AND r.system_role
  AND (SELECT array_agg(x.permission_code::text ORDER BY x.permission_code) FROM role_permissions x WHERE x.role_id = r.id)
      = ARRAY['branches:read', 'cash:drawer', 'cash:operate', 'inventory:read', 'kitchen:send', 'parties:read',
              'products:read', 'sales:create', 'sales:read', 'tables:operate']::text[];

DELETE FROM role_permissions rp
USING roles r
WHERE rp.role_id = r.id AND r.code = 'WAITER' AND r.system_role
  AND rp.permission_code IN ('cash:drawer', 'cash:operate', 'inventory:read', 'parties:read', 'sales:create', 'sales:read')
  AND (SELECT array_agg(x.permission_code::text ORDER BY x.permission_code) FROM role_permissions x WHERE x.role_id = r.id)
      = ARRAY['branches:read', 'cash:drawer', 'cash:operate', 'inventory:read', 'kitchen:send', 'parties:read',
              'products:read', 'sales:create', 'sales:read', 'tables:operate']::text[];
