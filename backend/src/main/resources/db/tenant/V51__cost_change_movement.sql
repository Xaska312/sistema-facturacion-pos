-- Decisión 334: el costo de un producto con movimientos se puede cambiar a mano (o por importación). Queda un renglón
-- "Cambio de costo" en el kardex de cada sede con existencias: cantidad 0, el costo nuevo y el anterior en el motivo.
ALTER TABLE stock_movements DROP CONSTRAINT ck_stock_movements_type;
ALTER TABLE stock_movements DROP CONSTRAINT ck_stock_movements_sign;
ALTER TABLE stock_movements DROP CONSTRAINT ck_stock_movements_quantity;
ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movements_type CHECK (type IN ('INITIAL', 'PURCHASE', 'SALE',
    'SALE_VOID', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN', 'DISPOSAL',
    'SUPPLIER_RETURN', 'COST_CHANGE'));
ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movements_quantity CHECK (quantity <> 0 OR type = 'COST_CHANGE');
ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movements_sign CHECK (
    (type IN ('INITIAL', 'PURCHASE', 'SALE_VOID', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN') AND quantity > 0)
    OR (type IN ('SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'DISPOSAL', 'SUPPLIER_RETURN') AND quantity < 0)
    OR (type = 'COST_CHANGE' AND quantity = 0));
