-- Decisión 249: índigo, el color de XASKA, es el color de marca por defecto. Los negocios que nunca eligieron color
-- pasan a índigo; quien eligió un color en Ajustes → Marca (queda en la auditoría como BRANDING_UPDATED con "color")
-- lo conserva, también si eligió turquesa, el color por defecto de antes.
ALTER TABLE business_branding ALTER COLUMN brand_color SET DEFAULT 'indigo';

UPDATE business_branding
   SET brand_color = 'indigo'
 WHERE brand_color = 'turquesa'
   AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'BRANDING_UPDATED' AND after_data ? 'color');
