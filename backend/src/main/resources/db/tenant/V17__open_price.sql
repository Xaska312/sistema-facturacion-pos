-- =====================================================================
-- Precio libre (decisión 253): el cajero escribe el precio al vender (impresiones, anillados, servicios a medida).
-- El precio de venta del producto queda como precio sugerido (puede ser 0). Solo productos normales: las variantes
-- con tallas siempre tienen el precio del modelo.
-- =====================================================================

ALTER TABLE products ADD COLUMN open_price BOOLEAN NOT NULL DEFAULT FALSE;
