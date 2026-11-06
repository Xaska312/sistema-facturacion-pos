-- =====================================================================
-- Decisión 290: cargar la factura del proveedor para llenar la recepción.
--   * purchase_documents: el archivo tal como se subió (XML o ZIP de la factura electrónica; fotos y PDF después),
--     guardado en el esquema del negocio como soporte de la compra. No se cambia; el que quedó unido a una compra
--     tampoco se borra (la llave foránea lo impide). Los que nunca se usaron se limpian a los 2 días.
--   * supplier_product_codes: "código del proveedor → nuestro producto", aprendido al confirmar cada recepción.
--   * Permiso purchases:import (lo reciben los roles del sistema que reciben mercancía).
-- =====================================================================

INSERT INTO permissions (code, module, description) VALUES
    ('purchases:import', 'purchases', 'Cargar la factura del proveedor (archivo o foto) para llenar la recepción');

INSERT INTO role_permissions (role_id, permission_code)
SELECT DISTINCT rp.role_id, 'purchases:import' FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
WHERE rp.permission_code = 'purchases:receive' AND r.system_role
  AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id = rp.role_id AND x.permission_code = 'purchases:import');

CREATE TABLE purchase_documents (
    id              UUID          PRIMARY KEY,
    kind            VARCHAR(10)   NOT NULL,
    file_name       VARCHAR(160)  NOT NULL,
    content_type    VARCHAR(60)   NOT NULL,
    size_bytes      INTEGER       NOT NULL,
    sha256          CHAR(64)      NOT NULL,
    content         BYTEA         NOT NULL,
    supplier_nit    VARCHAR(20),
    invoice_number  VARCHAR(40),
    cufe            VARCHAR(120),
    uploaded_by     UUID          NOT NULL,
    uploaded_at     TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_purchase_documents_kind CHECK (kind IN ('XML', 'ZIP', 'PDF', 'IMAGE')),
    CONSTRAINT ck_purchase_documents_size CHECK (size_bytes > 0 AND size_bytes <= 10485760)
);
CREATE INDEX ix_purchase_documents_uploaded ON purchase_documents (uploaded_at);

CREATE TRIGGER trg_purchase_documents_immutable BEFORE UPDATE ON purchase_documents
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_purchase_documents_truncate BEFORE TRUNCATE ON purchase_documents
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();

ALTER TABLE purchase_receipts ADD COLUMN document_id UUID REFERENCES purchase_documents (id);
CREATE UNIQUE INDEX uq_purchase_receipts_document ON purchase_receipts (document_id) WHERE document_id IS NOT NULL;

CREATE TABLE supplier_product_codes (
    supplier_id    UUID         NOT NULL REFERENCES suppliers (party_id),
    supplier_code  VARCHAR(60)  NOT NULL,
    product_id     UUID         NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    unit_id        UUID         NOT NULL REFERENCES units (id),
    updated_at     TIMESTAMPTZ  NOT NULL,
    updated_by     UUID         NOT NULL,
    PRIMARY KEY (supplier_id, supplier_code)
);
