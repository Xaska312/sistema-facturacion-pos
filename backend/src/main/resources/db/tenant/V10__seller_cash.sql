-- =====================================================================
-- Fase 7-6: el Vendedor cobra con su propia caja (decisión del usuario).
-- Antes tenía sales:create pero no cash:operate, y toda venta exige una caja abierta de quien vende: no podía
-- vender. A diferencia del Cajero, no registra clientes. Sigue sin ver el historial de cajas ni los arqueos de
-- otros (cash:read / cash:audit) y sin anular ventas.
-- Si el dueño ya personalizó el rol (le quitó vender o le cambió la descripción), se respeta.
-- =====================================================================

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'cash:operate' FROM roles r
WHERE r.code = 'SELLER' AND r.system_role
  AND EXISTS (SELECT 1 FROM role_permissions s WHERE s.role_id = r.id AND s.permission_code = 'sales:create')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'cash:operate');

UPDATE roles
SET description = 'Vende con su propia caja y consulta productos', updated_at = now(), version = version + 1
WHERE code = 'SELLER' AND system_role AND description = 'Registra ventas y consulta productos';
