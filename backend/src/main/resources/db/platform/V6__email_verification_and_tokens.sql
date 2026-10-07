-- =====================================================================
-- Fase 7-4: correo confirmado y enlaces de un solo uso (confirmar correo, restablecer contraseña).
-- =====================================================================

ALTER TABLE platform.users ADD COLUMN email_verified_at TIMESTAMPTZ;

-- Las cuentas creadas antes de esta versión se dan por confirmadas (no se les exige nada nuevo).
UPDATE platform.users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- Solo se guarda el hash SHA-256 del token: con un respaldo de la base no se pueden usar los enlaces.
CREATE TABLE platform.user_tokens (
    id          UUID         PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES platform.users (id),
    purpose     VARCHAR(20)  NOT NULL,
    token_hash  VARCHAR(64)  NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    -- Usado, o reemplazado por uno más nuevo del mismo propósito.
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_tokens_hash UNIQUE (token_hash),
    CONSTRAINT ck_user_tokens_purpose CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD'))
);

CREATE INDEX ix_user_tokens_user ON platform.user_tokens (user_id, purpose, created_at DESC);
