-- =====================================================================
-- Fase 12b-1 (decisión 268): adiciones y modificadores (tamaños, extras con precio, opciones obligatorias u
-- opcionales) y nota por producto en la venta. Se usan en el POS de cualquier tipo de negocio con el módulo MODIFIERS.
-- =====================================================================

-- Grupo de opciones reutilizable ("Tamaño", "Licor", "Extras"). min_select > 0 = obligatorio; max_select cuenta las
-- unidades elegidas en el grupo (un "Shot extra ×2" cuenta 2).
CREATE TABLE modifier_groups (
    id          UUID         PRIMARY KEY,
    name        VARCHAR(60)  NOT NULL,
    min_select  INTEGER      NOT NULL DEFAULT 0,
    max_select  INTEGER      NOT NULL DEFAULT 1,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL,
    created_by  UUID,
    updated_at  TIMESTAMPTZ  NOT NULL,
    updated_by  UUID,
    version     BIGINT       NOT NULL,
    CONSTRAINT ck_modifier_groups_select CHECK (min_select >= 0 AND max_select >= 1 AND max_select <= 20
        AND min_select <= max_select)
);
CREATE UNIQUE INDEX uq_modifier_groups_name ON modifier_groups (lower(name));

-- Opciones del grupo, en orden. price_delta puede ser 0 o negativo ("Sin licor"); max_quantity: cuántas veces se puede
-- elegir la misma opción.
CREATE TABLE modifier_options (
    id            UUID          PRIMARY KEY,
    group_id      UUID          NOT NULL REFERENCES modifier_groups (id),
    position      INTEGER       NOT NULL,
    name          VARCHAR(60)   NOT NULL,
    price_delta   NUMERIC(14,2) NOT NULL DEFAULT 0,
    max_quantity  INTEGER       NOT NULL DEFAULT 1,
    active        BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_modifier_options_price CHECK (price_delta > -100000000 AND price_delta < 100000000),
    CONSTRAINT ck_modifier_options_quantity CHECK (max_quantity >= 1 AND max_quantity <= 10)
);
CREATE INDEX ix_modifier_options_group ON modifier_options (group_id, position);

-- A qué productos y categorías se aplica cada grupo (un producto toma los suyos y los de su categoría).
CREATE TABLE product_modifier_groups (
    product_id  UUID     NOT NULL REFERENCES products (id),
    group_id    UUID     NOT NULL REFERENCES modifier_groups (id),
    PRIMARY KEY (product_id, group_id)
);
CREATE INDEX ix_product_modifier_groups_group ON product_modifier_groups (group_id);

CREATE TABLE category_modifier_groups (
    category_id UUID     NOT NULL REFERENCES categories (id),
    group_id    UUID     NOT NULL REFERENCES modifier_groups (id),
    PRIMARY KEY (category_id, group_id)
);
CREATE INDEX ix_category_modifier_groups_group ON category_modifier_groups (group_id);

-- En la venta: la nota de la línea ("sin cebolla") y las opciones elegidas con nombre y precio congelados. El precio
-- unitario de la línea ya incluye las adiciones. Inmutables, como las líneas.
ALTER TABLE sale_items ADD COLUMN note VARCHAR(140);

CREATE TABLE sale_item_modifiers (
    id            UUID          PRIMARY KEY,
    sale_item_id  UUID          NOT NULL REFERENCES sale_items (id),
    position      INTEGER       NOT NULL,
    group_name    VARCHAR(60)   NOT NULL,
    option_id     UUID,
    option_name   VARCHAR(60)   NOT NULL,
    quantity      INTEGER       NOT NULL,
    unit_price    NUMERIC(14,2) NOT NULL,
    CONSTRAINT ck_sale_item_modifiers_quantity CHECK (quantity >= 1 AND quantity <= 20)
);
CREATE INDEX ix_sale_item_modifiers_item ON sale_item_modifiers (sale_item_id);
CREATE INDEX ix_sale_item_modifiers_option ON sale_item_modifiers (option_id);

CREATE TRIGGER trg_sale_item_modifiers_immutable
    BEFORE UPDATE OR DELETE ON sale_item_modifiers
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();

-- Permiso para configurar las adiciones: Propietario y Administrador (el dueño lo da a otros roles).
INSERT INTO permissions (code, module, description) VALUES
    ('modifiers:manage', 'catalog', 'Crear y editar adiciones (tamaños, extras, opciones) y a qué productos aplican');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'modifiers:manage' FROM roles r
WHERE r.system_role AND r.code IN ('OWNER', 'ADMIN')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = 'modifiers:manage');
