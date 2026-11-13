-- Decisión 347: en la prueba gratis de XASKA IA se pueden leer 5 listas de precios (antes 2; el plan trae 20 al mes).
UPDATE platform.ai_allowances SET trial_limit = 5 WHERE code = 'CATALOG_READS' AND trial_limit < 5;
