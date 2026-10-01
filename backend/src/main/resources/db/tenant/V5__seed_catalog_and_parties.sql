-- =====================================================================
-- Fase 3: datos base del catálogo y terceros.
-- =====================================================================

INSERT INTO units (id, code, name, allows_decimals, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000000301', 'UND', 'Unidad',     FALSE, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000302', 'KG',  'Kilogramo',  TRUE,  now(), now(), 0),
    ('01920000-0000-7000-8000-000000000303', 'G',   'Gramo',      TRUE,  now(), now(), 0),
    ('01920000-0000-7000-8000-000000000304', 'LB',  'Libra',      TRUE,  now(), now(), 0),
    ('01920000-0000-7000-8000-000000000305', 'LT',  'Litro',      TRUE,  now(), now(), 0),
    ('01920000-0000-7000-8000-000000000306', 'ML',  'Mililitro',  TRUE,  now(), now(), 0),
    ('01920000-0000-7000-8000-000000000307', 'M',   'Metro',      TRUE,  now(), now(), 0),
    ('01920000-0000-7000-8000-000000000308', 'CJ',  'Caja',       FALSE, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000309', 'PAQ', 'Paquete',    FALSE, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000310', 'DOC', 'Docena',     FALSE, now(), now(), 0);

INSERT INTO taxes (id, code, name, type, rate, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000000401', 'IVA19',    'IVA 19 %',  'IVA',      19.00, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000402', 'IVA5',     'IVA 5 %',   'IVA',       5.00, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000403', 'EXENTO',   'Exento',    'EXEMPT',    0.00, now(), now(), 0),
    ('01920000-0000-7000-8000-000000000404', 'EXCLUIDO', 'Excluido',  'EXCLUDED',  0.00, now(), now(), 0);

INSERT INTO price_lists (id, code, name, is_default, created_at, updated_at, version) VALUES
    ('01920000-0000-7000-8000-000000000501', 'GENERAL', 'General', TRUE, now(), now(), 0);

-- Consumidor final (cuantías menores, documento 222222222222 según práctica DIAN).
INSERT INTO parties (id, person_type, document_type, document_number, first_names, last_names, system_party,
                     created_at, updated_at, version)
VALUES ('01920000-0000-7000-8000-000000000601', 'NATURAL', 'CC', '222222222222', 'Consumidor', 'Final', TRUE,
        now(), now(), 0);
INSERT INTO customers (party_id, price_list_id, credit_limit, created_at, updated_at, version)
VALUES ('01920000-0000-7000-8000-000000000601', NULL, 0, now(), now(), 0);
