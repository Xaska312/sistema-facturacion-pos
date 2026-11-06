-- Decisión 285: una zona de mesas puede tener su propia caja (dos pisos, cada uno con su caja). Las ventas de las
-- mesas de esa zona quedan en la caja de la zona aunque se cobren desde otra. Nula = la caja de quien cobra (lo normal).
ALTER TABLE dining_zones ADD COLUMN cash_register_id UUID REFERENCES cash_registers (id);
