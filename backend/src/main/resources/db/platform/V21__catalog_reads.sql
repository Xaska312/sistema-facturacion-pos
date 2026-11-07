-- Decisión 300: "Cargar con Aska" (listas de precios de proveedores leídas con IA), con su tope al mes.
INSERT INTO platform.ai_allowances (code, name, monthly_limit) VALUES
    ('CATALOG_READS', 'Listas de precios leídas', 20);
