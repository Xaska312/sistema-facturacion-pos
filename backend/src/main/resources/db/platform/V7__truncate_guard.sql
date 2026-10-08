-- Fase 7-6c (QA SEG-12): TRUNCATE no dispara los triggers BEFORE UPDATE OR DELETE; los eventos de seguridad tampoco
-- se pueden vaciar de un golpe.
CREATE TRIGGER trg_security_events_no_truncate BEFORE TRUNCATE ON platform.security_events
    FOR EACH STATEMENT EXECUTE FUNCTION platform.reject_security_event_change();
