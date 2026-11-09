-- Decisión 309: "Lo que hiciste con Aska".
--   * ai_questions.items: cuántos productos trajo cada lista o cuaderno leído con Aska (para el tiempo ahorrado).
--   * aska_recaps: el correo de cada mes ('2026-10') y el del final de la prueba ('TRIAL') se envían una sola vez,
--     aunque haya dos servidores.
ALTER TABLE ai_questions ADD COLUMN items INTEGER NOT NULL DEFAULT 0 CHECK (items >= 0);

CREATE TABLE aska_recaps (
    period   VARCHAR(10)  PRIMARY KEY,
    sent_at  TIMESTAMPTZ  NOT NULL
);
