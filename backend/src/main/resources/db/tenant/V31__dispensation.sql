-- =====================================================================
-- Fase 13-4 (decisión 282): dispensación de medicamentos.
--   * Vender un medicamento bajo fórmula (o de control especial) exige el permiso pharmacy:dispense y confirmar que se
--     vio la fórmula (Decreto 780 de 2016, art. 2.5.3.10.18: el dispensador no entrega sin fórmula ni la cambia).
--   * En antibióticos y control especial se anotan los datos básicos de la fórmula: quién la firmó (y su registro),
--     la fecha y el paciente (Resolución 234 de 2005 de la SDS y vigilancia de la resistencia antimicrobiana).
--   * Libro de dispensación (pharmacy:records): qué se dispensó, a quién, con qué fórmula, de qué lote y quién lo hizo.
--   * Roles del sistema Director técnico y Auxiliar de farmacia (los permisos de farmacia solo llegan al token con el
--     módulo Medicamentos).
-- =====================================================================

INSERT INTO permissions (code, module, description) VALUES
    ('pharmacy:dispense', 'pharmacy', 'Vender medicamentos bajo fórmula médica (confirma la fórmula)'),
    ('pharmacy:records',  'pharmacy', 'Consultar el libro de dispensación (fórmulas y antibióticos)');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r CROSS JOIN (VALUES ('pharmacy:dispense'), ('pharmacy:records')) AS p (code)
WHERE r.code IN ('OWNER', 'ADMIN') AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);

-- Director técnico: todo lo de farmacia (vender, dispensar, compras, inventario, lotes, bajas); sin pagos, usuarios
-- ni ajustes.
INSERT INTO roles (id, code, name, description, system_role, created_at, updated_at, version)
SELECT '01920000-0000-7000-8000-000000000009', 'PHARMACIST', 'Director técnico',
       'Responde por la farmacia: dispensa, recibe compras, controla lotes, vencimientos y bajas', TRUE, now(), now(), 0
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'PHARMACIST');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN (VALUES ('branches:read'), ('settings:read'), ('products:read'), ('products:manage'), ('parties:read'),
             ('parties:manage'), ('inventory:read'), ('inventory:adjust'), ('inventory:transfer'), ('cash:operate'),
             ('cash:read'), ('sales:create'), ('sales:read'), ('purchases:read'), ('purchases:receive'),
             ('reports:read'), ('pharmacy:dispense'), ('pharmacy:records')) AS p (code) ON TRUE
WHERE r.code = 'PHARMACIST' AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);

-- Auxiliar de farmacia: vende y dispensa con su caja.
INSERT INTO roles (id, code, name, description, system_role, created_at, updated_at, version)
SELECT '01920000-0000-7000-8000-000000000010', 'PHARMACY_ASSISTANT', 'Auxiliar de farmacia',
       'Vende y dispensa medicamentos con fórmula desde su caja', TRUE, now(), now(), 0
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'PHARMACY_ASSISTANT');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN (VALUES ('branches:read'), ('products:read'), ('parties:read'), ('parties:manage'), ('inventory:read'),
             ('cash:operate'), ('cash:read'), ('sales:create'), ('sales:read'), ('pharmacy:dispense')) AS p (code) ON TRUE
WHERE r.code = 'PHARMACY_ASSISTANT' AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_code = p.code);

CREATE TABLE sale_dispensations (
    sale_id               UUID          PRIMARY KEY REFERENCES sales (id),
    branch_id             UUID          NOT NULL REFERENCES branches (id),
    prescription_seen     BOOLEAN       NOT NULL,
    prescriber_name       VARCHAR(160),
    prescriber_license    VARCHAR(40),
    prescription_date     DATE,
    patient_document      VARCHAR(20),
    patient_name          VARCHAR(160),
    antibiotic            BOOLEAN       NOT NULL,
    controlled            BOOLEAN       NOT NULL,
    dispensed_by          UUID          NOT NULL,
    dispensed_at          TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_sale_dispensations_seen CHECK (prescription_seen),
    CONSTRAINT ck_sale_dispensations_data CHECK (NOT (antibiotic OR controlled) OR (prescriber_name IS NOT NULL
        AND prescription_date IS NOT NULL AND patient_document IS NOT NULL AND patient_name IS NOT NULL))
);
CREATE INDEX ix_sale_dispensations_at ON sale_dispensations (dispensed_at DESC);

CREATE TABLE sale_dispensation_lines (
    sale_id         UUID           NOT NULL REFERENCES sale_dispensations (sale_id),
    line_no         INTEGER        NOT NULL,
    product_id      UUID           NOT NULL REFERENCES products (id),
    sale_condition  VARCHAR(20)    NOT NULL,
    antibiotic      BOOLEAN        NOT NULL,
    PRIMARY KEY (sale_id, line_no)
);

CREATE TRIGGER trg_sale_dispensations_immutable BEFORE UPDATE OR DELETE ON sale_dispensations
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_sale_dispensation_lines_immutable BEFORE UPDATE OR DELETE ON sale_dispensation_lines
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_sale_dispensations_truncate BEFORE TRUNCATE ON sale_dispensations
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_sale_dispensation_lines_truncate BEFORE TRUNCATE ON sale_dispensation_lines
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
