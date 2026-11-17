package com.poshibrido.whatsapp.application;

import com.poshibrido.ai.application.AnthropicMessages;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Envía mensajes de texto por la API de WhatsApp en la nube (decisión 362). El token nunca sale en los logs; el número
 * del cliente se enmascara.
 */
@Slf4j
@Component
public class WhatsAppClient {

    private final WhatsAppProperties properties;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public WhatsAppClient(WhatsAppProperties properties) {
        this.properties = properties;
    }

    /** No se pudo enviar: sin configuración, sin red o Meta lo rechazó (por ejemplo, pasaron más de 24 horas). */
    public static class SendException extends RuntimeException {
        public SendException(String message) {
            super(message);
        }
    }

    /** Envía un texto y devuelve el id del mensaje en WhatsApp. */
    @SuppressWarnings("unchecked")
    public String sendText(String to, String text) {
        if (!properties.sends()) {
            throw new SendException("WhatsApp no está configurado en el servidor.");
        }
        Map<String, Object> body = Map.of("messaging_product", "whatsapp", "recipient_type", "individual",
                "to", to, "type", "text", "text", Map.of("preview_url", true, "body", text));
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://graph.facebook.com/" + properties.version()
                            + "/" + properties.phoneNumberId() + "/messages"))
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", "Bearer " + properties.accessToken())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(AnthropicMessages.JSON.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.warn("WhatsApp rechazó el mensaje a {}: {} {}", mask(to), response.statusCode(),
                        response.body().length() > 300 ? response.body().substring(0, 300) : response.body());
                throw new SendException("WhatsApp no aceptó el mensaje (" + response.statusCode() + ").");
            }
            Map<String, Object> parsed = AnthropicMessages.JSON.readValue(response.body(), Map.class);
            List<Map<String, Object>> messages = (List<Map<String, Object>>) parsed.get("messages");
            return messages == null || messages.isEmpty() ? null : String.valueOf(messages.getFirst().get("id"));
        } catch (IOException ex) {
            throw new SendException("No se pudo conectar con WhatsApp.");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new SendException("Se interrumpió el envío a WhatsApp.");
        }
    }

    static String mask(String phone) {
        return phone == null || phone.length() < 4 ? "***" : "***" + phone.substring(phone.length() - 4);
    }
}
