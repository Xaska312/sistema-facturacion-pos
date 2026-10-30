-- =====================================================================
-- Fase 12b-4 (decisión 271): pantalla de cocina en tiempo real, estados de la comanda, aviso de anulación y rol Cocina.
-- Estados (decisión del usuario): Nueva → Preparando → Lista → Entregada.
-- =====================================================================

ALTER TABLE kitchen_tickets
    ADD COLUMN kind          VARCHAR(10)  NOT NULL DEFAULT 'ORDER',
    ADD COLUMN void_of       UUID         REFERENCES kitchen_tickets (id),
    ADD COLUMN preparing_at  TIMESTAMPTZ,
    ADD COLUMN ready_at      TIMESTAMPTZ,
    ADD COLUMN ready_by      UUID,
    ADD COLUMN delivered_at  TIMESTAMPTZ,
    ADD COLUMN delivered_by  UUID;

-- kind ORDER: lo enviado; VOID: aviso de anulación de productos de la comanda void_of (sale en papel, no en la pantalla).
ALTER TABLE kitchen_tickets ADD CONSTRAINT ck_kitchen_tickets_kind CHECK (
    (kind = 'ORDER' AND void_of IS NULL) OR (kind = 'VOID' AND void_of IS NOT NULL));

-- La pantalla de cocina lee lo que falta por entregar de la sucursal.
CREATE INDEX ix_kitchen_tickets_board ON kitchen_tickets (branch_id, number)
    WHERE kind = 'ORDER' AND status <> 'DELIVERED';

-- Productos anulados que lleva cada aviso de anulación.
CREATE TABLE kitchen_ticket_voids (
    ticket_id    UUID  NOT NULL REFERENCES kitchen_tickets (id),
    tab_item_id  UUID  NOT NULL REFERENCES tab_items (id),
    PRIMARY KEY (ticket_id, tab_item_id)
);

-- Permiso de la pantalla de cocina: ver lo pendiente y cambiar el estado de las comandas.
INSERT INTO permissions (code, module, description) VALUES
    ('kitchen:view', 'kitchen', 'Usar la pantalla de cocina: ver comandas y marcarlas preparando, listas o entregadas');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'kitchen:view' FROM roles r
WHERE r.code IN ('OWNER', 'ADMIN') AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'kitchen:view');

-- Rol Cocina (decisión del usuario): solo la pantalla de cocina; no ve ventas, caja ni precios.
INSERT INTO roles (id, code, name, description, system_role, created_at, updated_at, version)
SELECT '01920000-0000-7000-8000-000000000008', 'COOK', 'Cocina',
       'Usa la pantalla de cocina: ve las comandas y las marca listas', TRUE, now(), now(), 0
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'COOK');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN (VALUES ('branches:read'), ('kitchen:view')) AS p (code) ON TRUE
WHERE r.code = 'COOK' AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);
