-- =====================================================================
-- Decisión 364: Aska también atiende el chat de xaska.co. Las conversaciones de la web se guardan junto a las de
-- WhatsApp (mismo agente, misma consola) con canal WEB: no tienen número, sino la sesión del navegador.
-- =====================================================================

ALTER TABLE platform.wa_conversations
    ALTER COLUMN phone DROP NOT NULL,
    ADD COLUMN channel     VARCHAR(10) NOT NULL DEFAULT 'WHATSAPP',
    ADD COLUMN web_session UUID,
    -- El WhatsApp que deja quien escribe por la web, para que el equipo lo contacte.
    ADD COLUMN lead_phone  VARCHAR(20),
    -- Decisión 368: quien usa nombre de usuario en WhatsApp puede llegar sin número, solo con su identificador de
    -- usuario para XASKA (BSUID, "CO.123…"). Se le responde a ese identificador.
    ADD COLUMN wa_user_id  VARCHAR(140),
    ADD CONSTRAINT uq_wa_conversations_wa_user UNIQUE (wa_user_id),
    ADD CONSTRAINT uq_wa_conversations_web_session UNIQUE (web_session),
    ADD CONSTRAINT ck_wa_conversations_channel CHECK (channel IN ('WHATSAPP', 'WEB')),
    ADD CONSTRAINT ck_wa_conversations_contact CHECK (
        (channel = 'WHATSAPP' AND (phone IS NOT NULL OR wa_user_id IS NOT NULL)) OR (channel = 'WEB' AND web_session IS NOT NULL));
