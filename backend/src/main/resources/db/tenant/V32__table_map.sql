-- =====================================================================
-- Mapa de mesas (decisión 284): cada mesa tiene su lugar en el plano de su zona (en unidades de un plano de 100 × 70,
-- así se ve igual en cualquier pantalla), su tamaño y su forma. Sin lugar (map_x nulo) la pantalla la acomoda sola.
-- "Pidió la cuenta": lo marca el mesero o la caja; se borra si la mesa pide algo más.
-- =====================================================================

ALTER TABLE dining_tables ADD COLUMN map_x NUMERIC(6,2);
ALTER TABLE dining_tables ADD COLUMN map_y NUMERIC(6,2);
ALTER TABLE dining_tables ADD COLUMN map_w NUMERIC(6,2) NOT NULL DEFAULT 12;
ALTER TABLE dining_tables ADD COLUMN map_h NUMERIC(6,2) NOT NULL DEFAULT 12;
ALTER TABLE dining_tables ADD COLUMN shape VARCHAR(10) NOT NULL DEFAULT 'SQUARE';
ALTER TABLE dining_tables ADD CONSTRAINT ck_dining_tables_shape CHECK (shape IN ('SQUARE', 'ROUND', 'RECT'));
ALTER TABLE dining_tables ADD CONSTRAINT ck_dining_tables_map CHECK (
    (map_x IS NULL) = (map_y IS NULL)
    AND (map_x IS NULL OR (map_x >= 0 AND map_x <= 100 AND map_y >= 0 AND map_y <= 70))
    AND map_w BETWEEN 4 AND 40 AND map_h BETWEEN 4 AND 40);

ALTER TABLE tabs ADD COLUMN bill_requested_at TIMESTAMPTZ;
ALTER TABLE tabs ADD COLUMN bill_requested_by UUID;
