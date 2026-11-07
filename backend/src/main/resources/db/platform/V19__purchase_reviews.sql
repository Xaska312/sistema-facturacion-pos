-- Decisión 297: revisión con IA del pedido sugerido ("Qué comprar"), con su tope al mes en XASKA IA.
INSERT INTO platform.ai_allowances (code, name, monthly_limit) VALUES
    ('PURCHASE_REVIEWS', 'Revisiones de pedidos a proveedores', 60);
