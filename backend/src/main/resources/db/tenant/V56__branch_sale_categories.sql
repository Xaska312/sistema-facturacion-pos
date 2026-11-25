-- =====================================================================
-- Decisión 378: qué vende cada sucursal. Un dueño con un supermercado y un restaurante no quiere ver el arroz en
-- Vender del restaurante ni los platos en el súper. Por defecto una sucursal vende todo el catálogo (sells_all); si
-- no, solo los productos de las categorías elegidas (y sus subcategorías). El catálogo y los precios siguen siendo
-- uno solo para todo el negocio.
-- =====================================================================

ALTER TABLE branches ADD COLUMN sells_all BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE branch_categories (
    branch_id    UUID  NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
    category_id  UUID  NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    PRIMARY KEY (branch_id, category_id)
);
CREATE INDEX ix_branch_categories_category ON branch_categories (category_id);
