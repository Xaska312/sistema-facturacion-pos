-- =====================================================================
-- Fase 7-6c (QA SEG-12): los triggers de inmutabilidad eran BEFORE UPDATE OR DELETE, y TRUNCATE no los dispara:
-- borraba de un golpe ventas, movimientos o la auditoría. Se agrega BEFORE TRUNCATE (por sentencia) a todas las
-- tablas que no se pueden modificar.
-- =====================================================================

CREATE TRIGGER trg_stock_movements_no_truncate BEFORE TRUNCATE ON stock_movements
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_inventory_documents_no_truncate BEFORE TRUNCATE ON inventory_documents
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_inventory_document_lines_no_truncate BEFORE TRUNCATE ON inventory_document_lines
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_cash_sessions_no_truncate BEFORE TRUNCATE ON cash_sessions
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_cash_movements_no_truncate BEFORE TRUNCATE ON cash_movements
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_sales_no_truncate BEFORE TRUNCATE ON sales
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_sale_items_no_truncate BEFORE TRUNCATE ON sale_items
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_sale_payments_no_truncate BEFORE TRUNCATE ON sale_payments
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_sale_tax_totals_no_truncate BEFORE TRUNCATE ON sale_tax_totals
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
CREATE TRIGGER trg_audit_log_no_truncate BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_change();
