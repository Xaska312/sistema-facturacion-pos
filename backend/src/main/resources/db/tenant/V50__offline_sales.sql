-- Decisión 332: ventas hechas sin internet. El equipo las guarda con un número provisional y las envía al volver la
-- conexión; created_at queda con la hora en que se vendió y offline_synced_at con la de llegada.
ALTER TABLE sales ADD COLUMN offline_number VARCHAR(40);
ALTER TABLE sales ADD COLUMN offline_synced_at TIMESTAMPTZ;
