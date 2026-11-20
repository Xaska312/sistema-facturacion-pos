-- =====================================================================
-- Decisión 375: Aska pregunta el nombre y si la persona ya es cliente de XASKA POS o lo está conociendo, y cada
-- conversación que se cierra (a mano, al despedirse o tras 30 minutos sin respuesta) pide una calificación de 1 a 5.
-- =====================================================================

-- CLIENT: ya usa XASKA POS (Aska le da soporte). NEW: lo está conociendo (Aska le asesora). Nulo: no se sabe.
ALTER TABLE platform.wa_conversations
    ADD COLUMN customer_kind VARCHAR(10),
    ADD CONSTRAINT ck_wa_conversations_kind CHECK (customer_kind IN ('CLIENT', 'NEW'));

-- Una fila por cada vez que se cerró la conversación y se pidió calificar (la misma conversación se reabre si la
-- persona vuelve a escribir, así que puede tener varias).
CREATE TABLE platform.wa_ratings (
    id               UUID          PRIMARY KEY,
    conversation_id  UUID          NOT NULL REFERENCES platform.wa_conversations (id) ON DELETE CASCADE,
    -- Quién la atendió al final: BOT (Aska) o HUMAN (alguien de XASKA).
    attended_by      VARCHAR(10)   NOT NULL,
    -- Quién la cerró: IDLE (30 minutos sin respuesta), BOT (Aska al despedirse) o XASKA (desde la consola).
    closed_by        VARCHAR(10)   NOT NULL,
    requested_at     TIMESTAMPTZ   NOT NULL,
    score            SMALLINT,
    rated_at         TIMESTAMPTZ,
    comment          VARCHAR(500),
    CONSTRAINT ck_wa_ratings_attended CHECK (attended_by IN ('BOT', 'HUMAN')),
    CONSTRAINT ck_wa_ratings_closed CHECK (closed_by IN ('IDLE', 'BOT', 'XASKA')),
    CONSTRAINT ck_wa_ratings_score CHECK (score BETWEEN 1 AND 5),
    CONSTRAINT ck_wa_ratings_rated CHECK ((score IS NULL) = (rated_at IS NULL))
);

CREATE INDEX ix_wa_ratings_conversation ON platform.wa_ratings (conversation_id, requested_at DESC);
