-- Fase 8a: más tipos de documento para clientes y proveedores (su código DIAN está en DocumentType).
-- PPT, tarjeta de extranjería, registro civil, NUIP, documento extranjero y NIT de otro país.

-- 'FOREIGN_NIT' tiene 11 caracteres: se amplía la columna (también la copia que guarda cada venta).
-- Ampliar un VARCHAR no reescribe las filas: las ventas registradas quedan intactas.
ALTER TABLE parties ALTER COLUMN document_type TYPE VARCHAR(15);
ALTER TABLE sales ALTER COLUMN customer_document_type TYPE VARCHAR(15);

ALTER TABLE parties DROP CONSTRAINT ck_parties_document_type;
ALTER TABLE parties ADD CONSTRAINT ck_parties_document_type CHECK (document_type IN (
    'CC', 'CE', 'NIT', 'PASSPORT', 'TI', 'PEP', 'PPT', 'TE', 'RC', 'NUIP', 'FOREIGN_ID', 'FOREIGN_NIT'));

-- Persona jurídica: NIT o NIT de otro país. Persona natural: cualquiera menos el NIT de otro país.
ALTER TABLE parties DROP CONSTRAINT ck_parties_legal_nit;
ALTER TABLE parties ADD CONSTRAINT ck_parties_legal_nit CHECK (
    (person_type = 'LEGAL' AND document_type IN ('NIT', 'FOREIGN_NIT'))
    OR (person_type = 'NATURAL' AND document_type <> 'FOREIGN_NIT'));
