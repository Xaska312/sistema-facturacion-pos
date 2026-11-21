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

    /**
     * Envía un texto y devuelve el id del mensaje en WhatsApp. {@code to} es el número o, para quien escribió sin
     * número, su identificador de usuario (BSUID, "CO.123…"), que va en {@code recipient} (decisión 368).
     */
    @SuppressWarnings("unchecked")
    public String sendText(String to, String text) {
        if (!properties.sends()) {
            throw new SendException("WhatsApp no está configurado en el servidor.");
        }
        Map<String, Object> body = body(to, text);
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

    /**
     * Envía una plantilla aprobada en Meta (para escribirle primero a alguien, decisión 371), con sus variables en
     * orden ({{1}}, {{2}}…). Devuelve el id del mensaje.
     */
    @SuppressWarnings("unchecked")
    public String sendTemplate(String to, String template, String language, List<String> params) {
        if (!properties.sends()) {
            throw new SendException("WhatsApp no está configurado en el servidor.");
        }
        List<Map<String, Object>> values = params.stream()
                .map(v -> Map.<String, Object>of("type", "text", "text", v)).toList();
        Map<String, Object> body = Map.of("messaging_product", "whatsapp", "recipient_type", "individual",
                to != null && to.contains(".") ? "recipient" : "to", to == null ? "" : to, "type", "template",
                "template", Map.of("name", template, "language", Map.of("code", language),
                        "components", List.of(Map.of("type", "body", "parameters", values))));
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
                log.warn("WhatsApp rechazó la plantilla {} a {}: {} {}", template, mask(to), response.statusCode(),
                        response.body().length() > 300 ? response.body().substring(0, 300) : response.body());
                throw new SendException("WhatsApp no aceptó la plantilla \"" + template + "\" (" + response.statusCode()
                        + "): " + metaError(response.body()));
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

    /** El texto de la lista de calificación y sus opciones: el id de cada fila es "rating_N" (decisión 375). */
    public static final String RATING_PROMPT = "¿Cómo te atendimos? Toca *Calificar* y elige de 1 a 5 ⭐";
    static final List<String[]> RATING_ROWS = List.of(
            new String[]{"rating_5", "⭐⭐⭐⭐⭐ 5", "Excelente"},
            new String[]{"rating_4", "⭐⭐⭐⭐ 4", "Buena"},
            new String[]{"rating_3", "⭐⭐⭐ 3", "Regular"},
            new String[]{"rating_2", "⭐⭐ 2", "Mala"},
            new String[]{"rating_1", "⭐ 1", "Muy mala"});

    /**
     * Envía la lista para calificar la atención de 1 a 5 (mensaje interactivo de WhatsApp, solo dentro de las 24
     * horas). Devuelve el id del mensaje.
     */
    @SuppressWarnings("unchecked")
    public String sendRatingList(String to) {
        if (!properties.sends()) {
            throw new SendException("WhatsApp no está configurado en el servidor.");
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://graph.facebook.com/" + properties.version()
                            + "/" + properties.phoneNumberId() + "/messages"))
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", "Bearer " + properties.accessToken())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(AnthropicMessages.JSON.writeValueAsString(ratingBody(to))))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.warn("WhatsApp rechazó la calificación a {}: {} {}", mask(to), response.statusCode(),
                        response.body().length() > 300 ? response.body().substring(0, 300) : response.body());
                throw new SendException("WhatsApp no aceptó la calificación (" + response.statusCode() + ").");
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

    static Map<String, Object> ratingBody(String to) {
        List<Map<String, Object>> rows = RATING_ROWS.stream()
                .map(r -> Map.<String, Object>of("id", r[0], "title", r[1], "description", r[2])).toList();
        return Map.of("messaging_product", "whatsapp", "recipient_type", "individual",
                to != null && to.contains(".") ? "recipient" : "to", to == null ? "" : to, "type", "interactive",
                "interactive", Map.of("type", "list", "body", Map.of("text", RATING_PROMPT),
                        "action", Map.of("button", "Calificar",
                                "sections", List.of(Map.of("title", "Tu calificación", "rows", rows)))));
    }

    /** El mensaje de error de Meta, para mostrárselo a quien administra (sin el token, que nunca va en la respuesta). */
    @SuppressWarnings("unchecked")
    static String metaError(String body) {
        try {
            Map<String, Object> parsed = AnthropicMessages.JSON.readValue(body, Map.class);
            Map<String, Object> error = (Map<String, Object>) parsed.get("error");
            if (error != null) {
                Object detail = error.get("error_data") instanceof Map<?, ?> d ? d.get("details") : null;
                String text = String.valueOf(detail != null ? detail : error.get("message"));
                return text.length() > 200 ? text.substring(0, 200) : text;
            }
        } catch (RuntimeException ex) {
            // Respuesta que no es JSON: se dice sin detalle.
        }
        return "sin detalle";
    }

    static Map<String, Object> body(String to, String text) {
        return Map.of("messaging_product", "whatsapp", "recipient_type", "individual",
                to != null && to.contains(".") ? "recipient" : "to", to == null ? "" : to,
                "type", "text", "text", Map.of("preview_url", true, "body", text));
    }

    static String mask(String phone) {
        return phone == null || phone.length() < 4 ? "***" : "***" + phone.substring(phone.length() - 4);
    }
}
