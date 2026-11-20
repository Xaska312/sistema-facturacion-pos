-- =====================================================================
-- Decisión 369: cuenta sin mesa, a nombre de alguien ("Cuenta · Juan"), para bares donde la gente se sienta donde
-- quiere. Decisión 370: quitar mesas. Si nunca tuvo cuentas se borra; si ya tuvo, se esconde (removed_at) para que
-- las ventas viejas conserven su nombre, y su nombre queda libre para una mesa nueva.
-- =====================================================================

ALTER TABLE tabs DROP CONSTRAINT ck_tabs_kind;
ALTER TABLE tabs ADD CONSTRAINT ck_tabs_kind CHECK (kind IN ('TABLE', 'TAKEAWAY', 'DELIVERY', 'NAMED'));

ALTER TABLE dining_tables ADD COLUMN removed_at TIMESTAMPTZ;
DROP INDEX uq_dining_tables_name;
CREATE UNIQUE INDEX uq_dining_tables_name ON dining_tables (branch_id, lower(name)) WHERE removed_at IS NULL;
