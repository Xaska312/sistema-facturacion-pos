-- =====================================================================
-- Decisión 366: Addi y Sistecrédito como medios de pago. El crédito se aprueba en la app de cada uno, como hoy; en
-- XASKA se registra la venta con ese medio y la referencia que dan. No entran al efectivo de la caja. Llegan apagados:
-- cada negocio los activa en Configuración → Ajustes si es aliado.
-- =====================================================================

INSERT INTO payment_methods (id, code, name, affects_cash, requires_reference, sort_order, active)
SELECT '01920000-0000-7000-8000-000000000707', 'ADDI', 'Addi', FALSE, TRUE, 6, FALSE
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE code = 'ADDI')
  AND NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = '01920000-0000-7000-8000-000000000707');

INSERT INTO payment_methods (id, code, name, affects_cash, requires_reference, sort_order, active)
SELECT '01920000-0000-7000-8000-000000000708', 'SISTECREDITO', 'Sistecrédito', FALSE, TRUE, 7, FALSE
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE code = 'SISTECREDITO')
  AND NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = '01920000-0000-7000-8000-000000000708');
