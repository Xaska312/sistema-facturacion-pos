-- =====================================================================
-- Fase 12b-3 (decisión 270): estaciones de cocina, comandas y rol Mesero. Módulo KITCHEN ("Cocina y comandas").
-- Al enviar, lo pedido en una cuenta sale en una comanda por estación (Cocina, Bar…). Cada producto va a la estación
-- que tenga asignada él mismo, si no a la de su categoría y si no a la principal.
-- =====================================================================

CREATE TABLE kitchen_stations (
    id          UUID         PRIMARY KEY,
    name        VARCHAR(40)  NOT NULL,
    is_main     BOOLEAN      NOT NULL DEFAULT FALSE,
    position    INTEGER      NOT NULL DEFAULT 0,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL,
    created_by  UUID,
    updated_at  TIMESTAMPTZ  NOT NULL,
    updated_by  UUID,
    version     BIGINT       NOT NULL,
    -- La principal recibe todo lo que no tiene otra estación: no se desactiva.
    CONSTRAINT ck_kitchen_stations_main CHECK (NOT is_main OR active)
);
CREATE UNIQUE INDEX uq_kitchen_stations_name ON kitchen_stations (lower(name));
CREATE UNIQUE INDEX uq_kitchen_stations_main ON kitchen_stations (is_main) WHERE is_main;

-- Asignaciones: un producto o una categoría van a una sola estación.
CREATE TABLE kitchen_station_categories (
    category_id  UUID  PRIMARY KEY REFERENCES categories (id),
    station_id   UUID  NOT NULL REFERENCES kitchen_stations (id)
);
CREATE INDEX ix_kitchen_station_categories_station ON kitchen_station_categories (station_id);

CREATE TABLE kitchen_station_products (
    product_id  UUID  PRIMARY KEY REFERENCES products (id),
    station_id  UUID  NOT NULL REFERENCES kitchen_stations (id)
);
CREATE INDEX ix_kitchen_station_products_station ON kitchen_station_products (station_id);

-- Comanda: lo que se envió de una cuenta a una estación de una vez. tab_label y station_name son los del momento de
-- enviar (si la mesa se mueve, la comanda impresa dice la mesa de entonces). status lo usa la pantalla de cocina
-- (Fase 12b-4). print_count: veces que se imprimió (la primera la reclama un solo equipo; las demás son reimpresiones).
CREATE TABLE kitchen_tickets (
    id            UUID         PRIMARY KEY,
    number        BIGINT       GENERATED ALWAYS AS IDENTITY,
    branch_id     UUID         NOT NULL REFERENCES branches (id),
    tab_id        UUID         NOT NULL REFERENCES tabs (id),
    station_id    UUID         NOT NULL REFERENCES kitchen_stations (id),
    station_name  VARCHAR(40)  NOT NULL,
    tab_label     VARCHAR(80)  NOT NULL,
    sent_by       UUID         NOT NULL,
    sent_at       TIMESTAMPTZ  NOT NULL,
    status        VARCHAR(10)  NOT NULL DEFAULT 'NEW',
    print_count   INTEGER      NOT NULL DEFAULT 0,
    printed_at    TIMESTAMPTZ,
    CONSTRAINT uq_kitchen_tickets_number UNIQUE (number),
    CONSTRAINT ck_kitchen_tickets_status CHECK (status IN ('NEW', 'PREPARING', 'READY', 'DELIVERED')),
    CONSTRAINT ck_kitchen_tickets_print CHECK (print_count >= 0)
);
CREATE INDEX ix_kitchen_tickets_branch ON kitchen_tickets (branch_id, sent_at);
CREATE INDEX ix_kitchen_tickets_unprinted ON kitchen_tickets (branch_id, number) WHERE print_count = 0;

-- Cada línea de la cuenta sale en una sola comanda.
ALTER TABLE tab_items ADD COLUMN ticket_id UUID REFERENCES kitchen_tickets (id);
ALTER TABLE tab_items ADD CONSTRAINT ck_tab_items_ticket CHECK (ticket_id IS NULL OR sent_at IS NOT NULL);
CREATE INDEX ix_tab_items_ticket ON tab_items (ticket_id) WHERE ticket_id IS NOT NULL;

-- La estación principal de todo negocio (solo se ve con el módulo encendido).
INSERT INTO kitchen_stations (id, name, is_main, position, active, created_at, updated_at, version)
VALUES ('01920000-0000-7000-8000-000000000301', 'Cocina', TRUE, 0, TRUE, now(), now(), 0);

-- Permisos: enviar a cocina (y reimprimir comandas) y configurar las estaciones.
INSERT INTO permissions (code, module, description) VALUES
    ('kitchen:send',   'kitchen', 'Enviar pedidos a cocina e imprimir comandas'),
    ('kitchen:manage', 'kitchen', 'Configurar las estaciones de cocina (Cocina, Bar…)');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN (VALUES ('OWNER', 'kitchen:send'), ('OWNER', 'kitchen:manage'),
             ('ADMIN', 'kitchen:send'), ('ADMIN', 'kitchen:manage'),
             ('CASHIER', 'kitchen:send'), ('SELLER', 'kitchen:send')) AS p (role_code, code) ON p.role_code = r.code
WHERE r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);

-- Rol Mesero (decisión del usuario): atiende mesas desde el celular, envía a cocina, mueve y une mesas, consulta
-- productos y clientes, cobra con su caja y ve sus ventas del día. Sin las mesas encendidas, sus permisos de mesas y
-- cocina no llegan al token.
INSERT INTO roles (id, code, name, description, system_role, created_at, updated_at, version)
SELECT '01920000-0000-7000-8000-000000000007', 'WAITER', 'Mesero',
       'Atiende mesas: pide, envía a cocina y cobra con su caja', TRUE, now(), now(), 0
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'WAITER');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN (VALUES ('branches:read'), ('products:read'), ('parties:read'), ('inventory:read'), ('cash:operate'),
             ('sales:create'), ('sales:read'), ('tables:operate'), ('kitchen:send')) AS p (code) ON TRUE
WHERE r.code = 'WAITER' AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);
