-- =====================================================================
-- Fase 7-3: suspensión de negocios. "Eliminar" un negocio = SUSPENDED: el schema y sus datos se conservan.
-- Lo suspende el administrador de plataforma (con motivo) o lo cierra su dueño; solo el administrador lo reactiva.
-- =====================================================================

ALTER TABLE platform.tenants
    ADD COLUMN suspended_at      TIMESTAMPTZ,
    ADD COLUMN suspended_by      UUID,
    ADD COLUMN suspension_reason VARCHAR(300),
    -- El dueño lo cerró ("eliminó"); si no, lo suspendió el administrador (aunque sea el mismo usuario).
    ADD COLUMN closed_by_owner   BOOLEAN      NOT NULL DEFAULT FALSE;

-- Suspendido siempre con fecha; fuera de SUSPENDED, sin datos de suspensión.
ALTER TABLE platform.tenants
    ADD CONSTRAINT ck_tenants_suspension CHECK (
        (status = 'SUSPENDED' AND suspended_at IS NOT NULL)
        OR (status <> 'SUSPENDED' AND suspended_at IS NULL AND suspended_by IS NULL AND suspension_reason IS NULL
            AND NOT closed_by_owner));
