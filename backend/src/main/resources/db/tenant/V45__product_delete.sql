-- Decisión 314: eliminar productos. Un producto eliminado queda oculto para siempre (fuera de listas, búsquedas y
-- ventas) pero el historial lo conserva; su SKU y sus códigos de barras quedan libres para otro producto.
ALTER TABLE products ADD COLUMN deleted_at TIMESTAMPTZ;
