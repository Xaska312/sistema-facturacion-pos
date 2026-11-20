package com.poshibrido.whatsapp.application;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneOffset;

/**
 * Las conversaciones de WhatsApp y del chat de xaska.co se guardan 12 meses desde su último mensaje
 * ({@code WHATSAPP_RETENTION_MONTHS}) y después se borran con sus mensajes, como dice la política de datos 1.4
 * (decisión 372). Corre cada madrugada.
 */
@Slf4j
@Component
public class WhatsAppRetention {

    private final WhatsAppConversations conversations;
    private final WhatsAppProperties properties;

    public WhatsAppRetention(WhatsAppConversations conversations, WhatsAppProperties properties) {
        this.conversations = conversations;
        this.properties = properties;
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "America/Bogota")
    public int purge() {
        Instant before = Instant.now().atOffset(ZoneOffset.UTC).minusMonths(properties.retention()).toInstant();
        int deleted = conversations.purgeOlderThan(before);
        if (deleted > 0) {
            log.info("Se borraron {} conversaciones de WhatsApp sin mensajes en {} meses", deleted, properties.retention());
        }
        return deleted;
    }
}
