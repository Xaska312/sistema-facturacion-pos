-- Decisión 299: Resumen del día de Aska.
--   * daily_digest_settings: una fila; si está prendido y a qué hora del negocio se arma (21:00 por defecto: lo del
--     día; antes del mediodía: lo de ayer).
--   * daily_digest_recipients: además del propietario, quiénes lo reciben por correo.
--   * daily_digests: el resumen de cada día (uno por fecha), para el correo y la tarjeta de Inicio.
CREATE TABLE daily_digest_settings (
    id          SMALLINT     PRIMARY KEY CHECK (id = 1),
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    send_time   TIME         NOT NULL DEFAULT '21:00',
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by  UUID
);
INSERT INTO daily_digest_settings (id) VALUES (1);

CREATE TABLE daily_digest_recipients (
    user_id  UUID  PRIMARY KEY REFERENCES members (id)
);

CREATE TABLE daily_digests (
    id             UUID          PRIMARY KEY,
    digest_date    DATE          NOT NULL UNIQUE,
    status         VARCHAR(12)   NOT NULL CHECK (status IN ('PENDING', 'OK', 'FAILED')),
    headline       VARCHAR(300),
    content        TEXT,
    model          VARCHAR(60),
    input_tokens   INTEGER       NOT NULL DEFAULT 0,
    output_tokens  INTEGER       NOT NULL DEFAULT 0,
    sent_to        INTEGER       NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ   NOT NULL
);
