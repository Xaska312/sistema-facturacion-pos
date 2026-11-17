-- =====================================================================
-- Decisión 362: agente de WhatsApp de XASKA (un solo número de XASKA, no de cada negocio). Atiende a prospectos y
-- clientes con el manual, los planes y los equipos, y pasa la conversación a una persona cuando hace falta.
-- Cada número que escribe tiene una conversación; los mensajes quedan para responder desde la consola de plataforma.
-- =====================================================================

CREATE TABLE platform.wa_conversations (
    id               UUID          PRIMARY KEY,
    phone            VARCHAR(20)   NOT NULL,
    profile_name     VARCHAR(120),
    -- BOT: responde el agente. HUMAN: la atiende una persona desde la consola. CLOSED: terminada.
    status           VARCHAR(10)   NOT NULL DEFAULT 'BOT',
    last_inbound_at  TIMESTAMPTZ,
    lead_name        VARCHAR(120),
    lead_business    VARCHAR(160),
    lead_city        VARCHAR(80),
    lead_need        VARCHAR(500),
    handoff_reason   VARCHAR(500),
    handoff_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_wa_conversations_phone UNIQUE (phone),
    CONSTRAINT ck_wa_conversations_status CHECK (status IN ('BOT', 'HUMAN', 'CLOSED'))
);

CREATE INDEX ix_wa_conversations_recent ON platform.wa_conversations (updated_at DESC);

CREATE TABLE platform.wa_messages (
    id               UUID          PRIMARY KEY,
    conversation_id  UUID          NOT NULL REFERENCES platform.wa_conversations (id) ON DELETE CASCADE,
    -- CUSTOMER: lo que escribió la persona. BOT: el agente. HUMAN: alguien de XASKA desde la consola.
    author           VARCHAR(10)   NOT NULL,
    body             TEXT          NOT NULL,
    -- Id del mensaje en WhatsApp: el mismo mensaje entrante no se procesa dos veces si Meta lo reenvía.
    wa_message_id    VARCHAR(128),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_wa_messages_wa_id UNIQUE (wa_message_id),
    CONSTRAINT ck_wa_messages_author CHECK (author IN ('CUSTOMER', 'BOT', 'HUMAN'))
);

CREATE INDEX ix_wa_messages_conversation ON platform.wa_messages (conversation_id, created_at);
