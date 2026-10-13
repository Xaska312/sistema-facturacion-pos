-- =====================================================================
-- Fase 9a: prueba de la autorización de datos personales (Ley 1581 de 2012). Cada vez que una persona acepta los
-- Términos y la Política de Tratamiento de Datos queda una fila: qué versiones aceptó, cuándo y desde dónde.
-- La versión vigente está en el código (LegalConsentService.TERMS_VERSION/PRIVACY_VERSION); si cambia, la app
-- vuelve a pedir la aceptación.
-- =====================================================================

CREATE TABLE platform.legal_consents (
    id              UUID          PRIMARY KEY,
    user_id         UUID          NOT NULL REFERENCES platform.users (id),
    terms_version   VARCHAR(20)   NOT NULL,
    privacy_version VARCHAR(20)   NOT NULL,
    accepted_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    ip              VARCHAR(45),
    user_agent      VARCHAR(255)
);

CREATE INDEX ix_legal_consents_user ON platform.legal_consents (user_id, accepted_at DESC);

-- Es una prueba: no se modifica ni se vacía de un golpe. Se puede borrar fila por fila (supresión de la cuenta).
CREATE FUNCTION platform.reject_legal_consent_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Las aceptaciones de términos no se modifican: registra una nueva.' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_legal_consents_immutable BEFORE UPDATE ON platform.legal_consents
    FOR EACH ROW EXECUTE FUNCTION platform.reject_legal_consent_change();
CREATE TRIGGER trg_legal_consents_no_truncate BEFORE TRUNCATE ON platform.legal_consents
    FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_legal_consent_change();
