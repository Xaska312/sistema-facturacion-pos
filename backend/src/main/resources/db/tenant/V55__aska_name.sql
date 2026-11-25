-- Decisión 376: el permiso de preguntarle a la IA usa el nombre único, Aska.
UPDATE permissions SET description = 'Preguntarle a Aska sobre el negocio (ve solo lo que sus permisos le dejan ver)'
 WHERE code = 'ai:ask';
