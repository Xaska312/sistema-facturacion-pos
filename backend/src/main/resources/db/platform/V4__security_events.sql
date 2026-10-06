-- =====================================================================
-- Fase 7-2: eventos de seguridad de la plataforma (inicios de sesión, bloqueos, accesos negados, negocios
-- creados). Lo que pasa dentro de un negocio va en su audit_log.
-- =====================================================================

CREATE TABLE platform.security_events (
    id           UUID         PRIMARY KEY,
    event        VARCHAR(40)  NOT NULL,
    -- Sin llave foránea: el intento puede ser de un correo que no existe, y el registro se guarda en su propia
    -- transacción (antes de que se confirme, p. ej., la creación del usuario).
    user_id      UUID,
    email        VARCHAR(254),
    tenant_id    UUID,
    ip           VARCHAR(45),
    user_agent   VARCHAR(255),
    details      JSONB,
    occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_security_events_occurred ON platform.security_events (occurred_at DESC, id DESC);
CREATE INDEX ix_security_events_user ON platform.security_events (user_id, occurred_at DESC);
CREATE INDEX ix_security_events_ip ON platform.security_events (ip, occurred_at DESC);
CREATE INDEX ix_security_events_email ON platform.security_events (email, occurred_at DESC);

-- Solo inserción: ni la aplicación ni un script pueden modificar o borrar eventos.
CREATE FUNCTION platform.reject_security_event_change() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    RAISE EXCEPTION 'Los eventos de seguridad son inmutables' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_security_events_immutable
    BEFORE UPDATE OR DELETE ON platform.security_events
    FOR EACH ROW EXECUTE FUNCTION platform.reject_security_event_change();
