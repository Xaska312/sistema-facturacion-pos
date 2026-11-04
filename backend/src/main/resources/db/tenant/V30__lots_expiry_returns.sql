-- =====================================================================
-- Fase 13-3 (decisión 281): lotes y vencimientos.
--   * La venta descuenta por lote con FEFO (primero lo que no tiene lote, de antes; luego el lote que vence primero;
--     nunca un lote vencido). La anulación devuelve a los mismos lotes. El lote vendido queda en el kardex.
--   * Los documentos de inventario (saldo inicial, ajuste, traslado y conteo) llevan lote por línea.
--   * Baja de vencidos y averiados (DISPOSAL) con acta: cómo se dispuso (gestor de residuos) y testigo.
--   * Devolución al proveedor contra una compra (purchase_returns): sale del lote recibido y baja lo que se le debe.
-- =====================================================================

ALTER TABLE stock_movements DROP CONSTRAINT ck_stock_movements_type;
ALTER TABLE stock_movements DROP CONSTRAINT ck_stock_movements_sign;
ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movements_type CHECK (type IN ('INITIAL', 'PURCHASE', 'SALE',
    'SALE_VOID', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN', 'DISPOSAL',
    'SUPPLIER_RETURN'));
ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movements_sign CHECK (
    (type IN ('INITIAL', 'PURCHASE', 'SALE_VOID', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN') AND quantity > 0)
    OR (type IN ('SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'DISPOSAL', 'SUPPLIER_RETURN') AND quantity < 0));

ALTER TABLE inventory_documents DROP CONSTRAINT ck_inventory_documents_type;
ALTER TABLE inventory_documents ADD CONSTRAINT ck_inventory_documents_type
    CHECK (type IN ('INITIAL', 'ADJUSTMENT', 'TRANSFER', 'COUNT', 'DISPOSAL'));
-- Acta de baja: cómo se dispuso lo dado de baja (gestor de residuos peligrosos, devolución…) y quién lo presenció.
ALTER TABLE inventory_documents ADD COLUMN disposal_method VARCHAR(200);
ALTER TABLE inventory_documents ADD COLUMN witness_name VARCHAR(160);
ALTER TABLE inventory_documents ADD CONSTRAINT ck_inventory_documents_disposal
    CHECK (type <> 'DISPOSAL' OR disposal_method IS NOT NULL);

ALTER TABLE inventory_document_lines ADD COLUMN lot_id UUID REFERENCES lots (id);
CREATE INDEX ix_inventory_document_lines_lot ON inventory_document_lines (lot_id) WHERE lot_id IS NOT NULL;

CREATE SEQUENCE purchase_return_seq START WITH 1;

CREATE TABLE purchase_returns (
    id               UUID           PRIMARY KEY,
    number           BIGINT         NOT NULL,
    receipt_id       UUID           NOT NULL REFERENCES purchase_receipts (id),
    branch_id        UUID           NOT NULL REFERENCES branches (id),
    reason           VARCHAR(255)   NOT NULL,
    subtotal         NUMERIC(14,2)  NOT NULL,
    tax_total        NUMERIC(14,2)  NOT NULL,
    total            NUMERIC(14,2)  NOT NULL,
    idempotency_key  VARCHAR(100),
    created_by       UUID           NOT NULL,
    created_at       TIMESTAMPTZ    NOT NULL,
    CONSTRAINT uq_purchase_returns_number UNIQUE (number),
    CONSTRAINT uq_purchase_returns_idempotency UNIQUE (idempotency_key),
    CONSTRAINT ck_purchase_returns_totals CHECK (subtotal >= 0 AND tax_total >= 0 AND total > 0)
);
CREATE INDEX ix_purchase_returns_receipt ON purchase_returns (receipt_id);

CREATE TABLE purchase_return_lines (
    id                UUID           PRIMARY KEY,
    return_id         UUID           NOT NULL REFERENCES purchase_returns (id),
    receipt_line_id   UUID           NOT NULL REFERENCES purchase_receipt_lines (id),
    product_id        UUID           NOT NULL REFERENCES products (id),
    lot_id            UUID           REFERENCES lots (id),
    quantity          NUMERIC(14,4)  NOT NULL,
    base_quantity     NUMERIC(14,4)  NOT NULL,
    unit_cost         NUMERIC(14,2)  NOT NULL,
    tax_rate          NUMERIC(5,2)   NOT NULL,
    line_total        NUMERIC(14,2)  NOT NULL,
    CONSTRAINT ck_purchase_return_lines_quantity CHECK (quantity > 0 AND base_quantity > 0)
);
CREATE INDEX ix_purchase_return_lines_receipt_line ON purchase_return_lines (receipt_line_id);

CREATE TRIGGER trg_purchase_returns_immutable BEFORE UPDATE OR DELETE ON purchase_returns
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_purchase_return_lines_immutable BEFORE UPDATE OR DELETE ON purchase_return_lines
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_purchase_returns_truncate BEFORE TRUNCATE ON purchase_returns
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_purchase_return_lines_truncate BEFORE TRUNCATE ON purchase_return_lines
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
