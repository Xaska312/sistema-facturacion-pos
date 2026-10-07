package com.poshibrido.mail;

import com.poshibrido.shared.json.Json;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Envío por la API HTTP de Resend ({@code POST https://api.resend.com/emails}). Por HTTPS y no por SMTP: los
 * proveedores de servidores suelen bloquear los puertos de correo saliente.
 */
public class ResendMailSender implements MailSender {

    static final URI ENDPOINT = URI.create("https://api.resend.com/emails");

    private final HttpClient http;
    private final String apiKey;
    private final String from;
    private final URI endpoint;

    public ResendMailSender(String apiKey, String from) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(), apiKey, from, ENDPOINT);
    }

    ResendMailSender(HttpClient http, String apiKey, String from, URI endpoint) {
        this.http = http;
        this.apiKey = apiKey;
        this.from = from;
        this.endpoint = endpoint;
    }

    @Override
    public String name() {
        return "resend";
    }

    @Override
    public void deliver(MailMessage message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("from", from);
        body.put("to", List.of(message.to()));
        body.put("subject", message.subject());
        body.put("html", message.html());
        body.put("text", message.text());
        HttpRequest.Builder request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(Json.write(body)));
        if (message.idempotencyKey() != null) {
            request.header("Idempotency-Key", message.idempotencyKey());
        }
        HttpResponse<String> response;
        try {
            response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            throw new MailDeliveryException("Resend no respondió: " + ex.getMessage(), true, ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new MailDeliveryException("Envío interrumpido", false, ex);
        }
        int status = response.statusCode();
        if (status >= 200 && status < 300) {
            return;
        }
        boolean retryable = status == 429 || status >= 500;
        String detail = response.body() == null ? "" : response.body();
        throw new MailDeliveryException("Resend respondió " + status + ": "
                + detail.substring(0, Math.min(detail.length(), 300)), retryable, null);
    }
}
