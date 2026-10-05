-- =====================================================================
-- Fase 6: índices para los reportes (consultas de lectura por rango de fechas).
-- =====================================================================

-- Reportes y tablero: solo ventas registradas, por fecha.
CREATE INDEX ix_sales_completed_created ON sales (created_at) WHERE status = 'COMPLETED';

-- Ventas por vendedor y "mis ventas de hoy".
CREATE INDEX ix_sales_seller_created ON sales (created_by, created_at);

-- Utilidad por producto y categoría: líneas de las ventas del rango (ya existe el índice único por sale_id, line_no);
-- productos más vendidos agrupan por producto.
CREATE INDEX ix_sale_items_sale_product ON sale_items (sale_id, product_id);

-- Medios de pago por rango.
CREATE INDEX ix_sale_payments_method ON sale_payments (payment_method_id, sale_id);
