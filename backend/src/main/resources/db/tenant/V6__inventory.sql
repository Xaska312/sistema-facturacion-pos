-- =====================================================================
-- Fase 4: inventario (ledger de movimientos inmutables, saldos por sucursal,
-- documentos de inventario y costo promedio ponderado).
-- =====================================================================

-- El costo del producto pasa a ser el costo promedio ponderado una vez tiene movimientos.
ALTER TABLE products ADD COLUMN cost_locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE stock_balances (
    id               UUID          PRIMARY KEY,
    branch_id        UUID          NOT NULL REFERENCES branches (id),
    product_id       UUID          NOT NULL REFERENCES products (id),
    lot_id           UUID          REFERENCES lots (id),
    quantity         NUMERIC(14,4) NOT NULL DEFAULT 0,
    min_stock        NUMERIC(14,4),
    max_stock        NUMERIC(14,4),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version          BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_stock_balances_levels CHECK (
        (min_stock IS NULL OR min_stock >= 0) AND (max_stock IS NULL OR max_stock >= 0)
        AND (min_stock IS NULL OR max_stock IS NULL OR max_stock >= min_stock))
);
-- Un saldo por sucursal y producto (sin lote) y uno por lote (fase PHARMACY).
CREATE UNIQUE INDEX uq_stock_balances_no_lot ON stock_balances (branch_id, product_id) WHERE lot_id IS NULL;
CREATE UNIQUE INDEX uq_stock_balances_lot ON stock_balances (branch_id, product_id, lot_id) WHERE lot_id IS NOT NULL;
CREATE INDEX ix_stock_balances_product ON stock_balances (product_id);

CREATE SEQUENCE inventory_document_seq START WITH 1;

CREATE TABLE inventory_documents (
    id               UUID          PRIMARY KEY,
    number           BIGINT        NOT NULL,
    type             VARCHAR(20)   NOT NULL,
    branch_id        UUID          NOT NULL REFERENCES branches (id),
    target_branch_id UUID          REFERENCES branches (id),
    reason           VARCHAR(255),
    notes            VARCHAR(500),
    idempotency_key  VARCHAR(100),
    created_by       UUID,
    created_at       TIMESTAMPTZ   NOT NULL,
    CONSTRAINT uq_inventory_documents_number UNIQUE (number),
    CONSTRAINT uq_inventory_documents_idempotency UNIQUE (idempotency_key),
    CONSTRAINT ck_inventory_documents_type CHECK (type IN ('INITIAL', 'ADJUSTMENT', 'TRANSFER', 'COUNT')),
    CONSTRAINT ck_inventory_documents_transfer CHECK (
        (type = 'TRANSFER' AND target_branch_id IS NOT NULL AND target_branch_id <> branch_id)
        OR (type <> 'TRANSFER' AND target_branch_id IS NULL))
);
CREATE INDEX ix_inventory_documents_created ON inventory_documents (created_at DESC);

CREATE TABLE inventory_document_lines (
    id                 UUID          PRIMARY KEY,
    document_id        UUID          NOT NULL REFERENCES inventory_documents (id),
    line_no            INTEGER       NOT NULL,
    product_id         UUID          NOT NULL REFERENCES products (id),
    unit_id            UUID          NOT NULL REFERENCES units (id),
    quantity           NUMERIC(14,4) NOT NULL,
    factor             NUMERIC(14,4) NOT NULL,
    base_quantity      NUMERIC(14,4) NOT NULL,
    direction          VARCHAR(3),
    unit_cost          NUMERIC(14,2),
    expected_quantity  NUMERIC(14,4),
    counted_quantity   NUMERIC(14,4),
    CONSTRAINT uq_inventory_document_lines UNIQUE (document_id, line_no),
    CONSTRAINT ck_inventory_document_lines_direction CHECK (direction IS NULL OR direction IN ('IN', 'OUT'))
);

-- Ledger: solo inserción. quantity con signo, en unidad base. balance_after = saldo de la
-- sucursal después del movimiento. unit_cost = costo unitario (base) del movimiento.
CREATE TABLE stock_movements (
    id               UUID          PRIMARY KEY,
    -- Orden de registro (estricto por producto y sucursal porque sus saldos se bloquean al escribir).
    entry_no         BIGINT        GENERATED ALWAYS AS IDENTITY,
    branch_id        UUID          NOT NULL REFERENCES branches (id),
    product_id       UUID          NOT NULL REFERENCES products (id),
    lot_id           UUID          REFERENCES lots (id),
    type             VARCHAR(20)   NOT NULL,
    quantity         NUMERIC(14,4) NOT NULL,
    unit_cost        NUMERIC(14,2) NOT NULL,
    balance_after    NUMERIC(14,4) NOT NULL,
    reference_type   VARCHAR(30)   NOT NULL,
    reference_id     UUID          NOT NULL,
    reason           VARCHAR(255),
    created_by       UUID,
    created_at       TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_stock_movements_type CHECK (type IN ('INITIAL', 'PURCHASE', 'SALE', 'SALE_VOID', 'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN')),
    CONSTRAINT ck_stock_movements_quantity CHECK (quantity <> 0),
    CONSTRAINT ck_stock_movements_sign CHECK (
        (type IN ('INITIAL', 'PURCHASE', 'SALE_VOID', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN') AND quantity > 0)
        OR (type IN ('SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT') AND quantity < 0))
);
CREATE UNIQUE INDEX uq_stock_movements_entry ON stock_movements (entry_no);
CREATE INDEX ix_stock_movements_kardex ON stock_movements (product_id, branch_id, entry_no);
CREATE INDEX ix_stock_movements_reference ON stock_movements (reference_type, reference_id);

-- Inmutabilidad garantizada por la base de datos: ni la aplicación ni un script pueden
-- modificar o borrar movimientos o documentos ya registrados.
CREATE FUNCTION reject_ledger_change() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    RAISE EXCEPTION 'Los registros de % son inmutables', TG_TABLE_NAME USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_stock_movements_immutable
    BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();

CREATE TRIGGER trg_inventory_documents_immutable
    BEFORE UPDATE OR DELETE ON inventory_documents
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();

CREATE TRIGGER trg_inventory_document_lines_immutable
    BEFORE UPDATE OR DELETE ON inventory_document_lines
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_change();
