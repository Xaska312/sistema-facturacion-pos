-- =====================================================================
-- Fase 12b-2 (decisión 269): mesas por zona y cuentas abiertas (mesa, para llevar o domicilio). La cuenta no toca el
-- inventario ni la caja: al cobrarla se vuelve una venta normal. Módulo TABLES.
-- =====================================================================

-- Zonas de cada sucursal (Salón, Terraza, Barra) y sus mesas, en orden.
CREATE TABLE dining_zones (
    id          UUID         PRIMARY KEY,
    branch_id   UUID         NOT NULL REFERENCES branches (id),
    name        VARCHAR(40)  NOT NULL,
    position    INTEGER      NOT NULL DEFAULT 0,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL,
    created_by  UUID,
    updated_at  TIMESTAMPTZ  NOT NULL,
    updated_by  UUID,
    version     BIGINT       NOT NULL
);
CREATE UNIQUE INDEX uq_dining_zones_name ON dining_zones (branch_id, lower(name));

CREATE TABLE dining_tables (
    id          UUID         PRIMARY KEY,
    branch_id   UUID         NOT NULL REFERENCES branches (id),
    zone_id     UUID         NOT NULL REFERENCES dining_zones (id),
    name        VARCHAR(20)  NOT NULL,
    seats       INTEGER,
    position    INTEGER      NOT NULL DEFAULT 0,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL,
    created_by  UUID,
    updated_at  TIMESTAMPTZ  NOT NULL,
    updated_by  UUID,
    version     BIGINT       NOT NULL,
    CONSTRAINT ck_dining_tables_seats CHECK (seats IS NULL OR (seats >= 1 AND seats <= 99))
);
-- Nombre único en la sucursal ("4" en Salón y "4" en Terraza confundiría al mesero).
CREATE UNIQUE INDEX uq_dining_tables_name ON dining_tables (branch_id, lower(name));
CREATE INDEX ix_dining_tables_zone ON dining_tables (zone_id, position);

-- Cuenta abierta. kind TABLE lleva mesa; TAKEAWAY ("para llevar") y DELIVERY (domicilio) no.
-- status: OPEN → CHARGED (se volvió la venta sale_id), CANCELLED (con motivo) o MERGED (se unió a merged_into).
CREATE TABLE tabs (
    id             UUID          PRIMARY KEY,
    number         BIGINT        GENERATED ALWAYS AS IDENTITY,
    branch_id      UUID          NOT NULL REFERENCES branches (id),
    kind           VARCHAR(10)   NOT NULL,
    table_id       UUID          REFERENCES dining_tables (id),
    status         VARCHAR(10)   NOT NULL DEFAULT 'OPEN',
    guests         INTEGER,
    customer_name  VARCHAR(120),
    phone          VARCHAR(30),
    address        VARCHAR(200),
    notes          VARCHAR(200),
    opened_by      UUID          NOT NULL,
    opened_at      TIMESTAMPTZ   NOT NULL,
    closed_by      UUID,
    closed_at      TIMESTAMPTZ,
    sale_id        UUID          REFERENCES sales (id),
    merged_into    UUID          REFERENCES tabs (id),
    cancel_reason  VARCHAR(200),
    version        BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT uq_tabs_number UNIQUE (number),
    CONSTRAINT ck_tabs_kind CHECK (kind IN ('TABLE', 'TAKEAWAY', 'DELIVERY')),
    CONSTRAINT ck_tabs_status CHECK (status IN ('OPEN', 'CHARGED', 'CANCELLED', 'MERGED')),
    CONSTRAINT ck_tabs_table CHECK ((kind = 'TABLE') = (table_id IS NOT NULL)),
    CONSTRAINT ck_tabs_guests CHECK (guests IS NULL OR (guests >= 1 AND guests <= 99))
);
-- Una mesa tiene a lo sumo una cuenta abierta.
CREATE UNIQUE INDEX uq_tabs_open_table ON tabs (table_id) WHERE status = 'OPEN';
CREATE INDEX ix_tabs_open ON tabs (branch_id, opened_at) WHERE status = 'OPEN';
CREATE UNIQUE INDEX uq_tabs_sale ON tabs (sale_id) WHERE sale_id IS NOT NULL;

-- Lo pedido. unit_price (producto + adiciones) y name son los del momento de agregar, para mostrar; al cobrar manda el
-- precio vigente. base_price: el del producto sin adiciones (en precio libre, el que escribió quien lo agregó).
-- sent_at: cuándo salió a cocina (Fase 12b-3). Quitar no borra: queda voided_* con el motivo.
CREATE TABLE tab_items (
    id           UUID           PRIMARY KEY,
    tab_id       UUID           NOT NULL REFERENCES tabs (id),
    position     INTEGER        NOT NULL,
    product_id   UUID           NOT NULL REFERENCES products (id),
    unit_id      UUID           REFERENCES units (id),
    name         VARCHAR(200)   NOT NULL,
    quantity     NUMERIC(14,4)  NOT NULL,
    unit_price   NUMERIC(14,2)  NOT NULL,
    base_price   NUMERIC(14,2)  NOT NULL,
    open_price   BOOLEAN        NOT NULL DEFAULT FALSE,
    note         VARCHAR(140),
    added_by     UUID           NOT NULL,
    added_at     TIMESTAMPTZ    NOT NULL,
    sent_at      TIMESTAMPTZ,
    voided_by    UUID,
    voided_at    TIMESTAMPTZ,
    void_reason  VARCHAR(200),
    CONSTRAINT ck_tab_items_quantity CHECK (quantity > 0)
);
CREATE INDEX ix_tab_items_tab ON tab_items (tab_id, position);

-- Adiciones elegidas en cada línea (Fase 12b-1), con nombre y precio del momento de agregar.
CREATE TABLE tab_item_modifiers (
    id           UUID           PRIMARY KEY,
    tab_item_id  UUID           NOT NULL REFERENCES tab_items (id),
    position     INTEGER        NOT NULL,
    group_name   VARCHAR(60)    NOT NULL,
    option_id    UUID           NOT NULL,
    option_name  VARCHAR(60)    NOT NULL,
    quantity     INTEGER        NOT NULL,
    price        NUMERIC(14,2)  NOT NULL,
    CONSTRAINT ck_tab_item_modifiers_quantity CHECK (quantity >= 1 AND quantity <= 20)
);
CREATE INDEX ix_tab_item_modifiers_item ON tab_item_modifiers (tab_item_id, position);

-- Permisos: usar las mesas (abrir, pedir, mover, unir), configurarlas, y anular lo que ya salió a cocina.
INSERT INTO permissions (code, module, description) VALUES
    ('tables:operate', 'tables', 'Atender mesas: abrir cuentas, agregar productos, mover y unir mesas'),
    ('tables:manage',  'tables', 'Configurar zonas y mesas'),
    ('tables:void',    'tables', 'Anular en cuentas lo que ya salió a cocina y cancelar cuentas con productos');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN (VALUES ('OWNER', 'tables:operate'), ('OWNER', 'tables:manage'), ('OWNER', 'tables:void'),
             ('ADMIN', 'tables:operate'), ('ADMIN', 'tables:manage'), ('ADMIN', 'tables:void'),
             ('CASHIER', 'tables:operate'), ('CASHIER', 'tables:void'),
             ('SELLER', 'tables:operate')) AS p (role_code, code) ON p.role_code = r.code
WHERE r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);
