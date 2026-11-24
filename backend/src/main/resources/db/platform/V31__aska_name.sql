-- =====================================================================
-- Decisión 376: un solo nombre para la IA de XASKA, "Aska" (antes el adicional se llamaba "XASKA IA" y la asistente
-- "Aska"; en xaska.co salía "ASKA"). Solo cambia el nombre que se muestra: el código del adicional sigue siendo AI.
-- =====================================================================

UPDATE platform.addons SET name = 'Aska' WHERE code = 'AI' AND name = 'XASKA IA';
