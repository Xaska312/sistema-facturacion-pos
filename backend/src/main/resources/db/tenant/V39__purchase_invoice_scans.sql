-- Decisión 295: ingresar la mercancía con la foto o el PDF de la factura, leída con IA.
--   * Permiso purchases:scan: lo reciben los roles del sistema que ya cargan la factura del proveedor.
--   * purchase_invoice_scans: cada lectura (OK, FAILED si no se pudo leer, UNAVAILABLE si el servicio no respondió).
--     Solo las OK cuentan en el tope del mes del plan. Guarda el modelo y los tokens (para saber el costo), nunca la
--     imagen: el soporte de la compra queda en purchase_documents como el XML.

INSERT INTO permissions (code, module, description) VALUES
    ('purchases:scan', 'purchases', 'Leer con IA la foto o el PDF de la factura del proveedor');

INSERT INTO role_permissions (role_id, permission_code)
SELECT DISTINCT rp.role_id, 'purchases:scan' FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
WHERE rp.permission_code = 'purchases:import' AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id = rp.role_id AND x.permission_code = 'purchases:scan');

CREATE TABLE purchase_invoice_scans (
    id             UUID          PRIMARY KEY,
    document_id    UUID          REFERENCES purchase_documents (id) ON DELETE SET NULL,
    status         VARCHAR(12)   NOT NULL,
    pages          INTEGER       NOT NULL,
    model          VARCHAR(60),
    input_tokens   INTEGER       NOT NULL DEFAULT 0,
    output_tokens  INTEGER       NOT NULL DEFAULT 0,
    reason         VARCHAR(200),
    created_by     UUID          NOT NULL,
    created_at     TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_purchase_invoice_scans_status CHECK (status IN ('OK', 'FAILED', 'UNAVAILABLE'))
);
CREATE INDEX ix_purchase_invoice_scans_created ON purchase_invoice_scans (created_at);
