-- Decisión 294: cartas por piso. Un restaurante de dos pisos con su carta cada uno (comida rápida abajo, cócteles
-- arriba): cada carta tiene su caja y sus categorías (y productos sueltos, que mandan sobre su categoría). Al cobrar
-- una cuenta, lo de cada carta queda en la caja de su carta aunque la mesa esté en el otro piso o se pague en otra
-- caja; si una cuenta trae de las dos cartas, se registra una venta por caja (con el pago repartido en proporción) y
-- el cliente recibe un solo tiquete con las dos partes. Lo que no está en ninguna carta va a la caja de la zona de la
-- mesa (decisión 285) o, si no tiene, a la de quien cobra. Cada sucursal tiene sus cartas.

CREATE TABLE dining_menus (
    id                UUID         PRIMARY KEY,
    branch_id         UUID         NOT NULL REFERENCES branches (id),
    name              VARCHAR(40)  NOT NULL,
    cash_register_id  UUID         NOT NULL REFERENCES cash_registers (id),
    position          INTEGER      NOT NULL DEFAULT 0,
    active            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ  NOT NULL,
    created_by        UUID,
    updated_at        TIMESTAMPTZ  NOT NULL,
    updated_by        UUID,
    version           BIGINT       NOT NULL
);
CREATE UNIQUE INDEX uq_dining_menus_name ON dining_menus (branch_id, lower(name));

-- Una categoría o un producto están en una sola carta por sucursal (si se asignan a otra, pasan a esa).
CREATE TABLE dining_menu_categories (
    branch_id    UUID  NOT NULL REFERENCES branches (id),
    category_id  UUID  NOT NULL REFERENCES categories (id),
    menu_id      UUID  NOT NULL REFERENCES dining_menus (id) ON DELETE CASCADE,
    PRIMARY KEY (branch_id, category_id)
);
CREATE INDEX ix_dining_menu_categories_menu ON dining_menu_categories (menu_id);

CREATE TABLE dining_menu_products (
    branch_id   UUID  NOT NULL REFERENCES branches (id),
    product_id  UUID  NOT NULL REFERENCES products (id),
    menu_id     UUID  NOT NULL REFERENCES dining_menus (id) ON DELETE CASCADE,
    PRIMARY KEY (branch_id, product_id)
);
CREATE INDEX ix_dining_menu_products_menu ON dining_menu_products (menu_id);

-- Las ventas de un mismo cobro partido entre cajas: charge_id es la venta principal (la de la caja que cobra, con la
-- propina y el cambio); label, la carta o zona de cada parte ("Piso 2"). Sirve para el tiquete con las dos partes.
CREATE TABLE sale_split_parts (
    sale_id    UUID         PRIMARY KEY REFERENCES sales (id),
    charge_id  UUID         NOT NULL REFERENCES sales (id),
    position   INTEGER      NOT NULL,
    label      VARCHAR(80)  NOT NULL
);
CREATE INDEX ix_sale_split_parts_charge ON sale_split_parts (charge_id);
