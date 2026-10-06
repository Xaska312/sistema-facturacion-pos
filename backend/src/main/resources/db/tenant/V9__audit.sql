-- =====================================================================
-- Fase 7-2: consulta de la auditoría del negocio.
-- =====================================================================

INSERT INTO permissions (code, module, description) VALUES
    ('audit:read', 'audit', 'Consultar la auditoría del negocio (quién hizo qué y cuándo)');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'audit:read' FROM roles r WHERE r.code IN ('OWNER', 'ADMIN', 'ACCOUNTANT');

-- Listado por fecha (más reciente primero) y por usuario.
CREATE INDEX ix_audit_log_created ON audit_log (created_at DESC, id DESC);
CREATE INDEX ix_audit_log_actor ON audit_log (actor_id, created_at DESC);

-- Solo inserción: la auditoría se guarda para siempre y nadie la puede modificar ni borrar desde la aplicación
-- (misma función que los movimientos de inventario y ventas, V6).
CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
