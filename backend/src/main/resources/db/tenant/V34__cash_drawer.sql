-- Decisión 286: abrir el cajón monedero sin una venta (botón "Abrir cajón" con la impresora de XASKA Impresora). Es su
-- propio permiso y cada apertura queda en la auditoría. Lo reciben los roles del sistema que operan la caja.
INSERT INTO permissions (code, module, description) VALUES
    ('cash:drawer', 'cash', 'Abrir el cajón monedero sin una venta');

INSERT INTO role_permissions (role_id, permission_code)
SELECT DISTINCT rp.role_id, 'cash:drawer' FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
WHERE rp.permission_code = 'cash:operate' AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id = rp.role_id AND x.permission_code = 'cash:drawer');
