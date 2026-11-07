package com.poshibrido.ai.application;

import com.poshibrido.purchasing.application.AiProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * La API de Mensajes de Anthropic para las funciones de XASKA IA (decisión 296): una petición, su respuesta como mapa.
 * La clave y el modelo salen de {@link AiProperties} ({@code ANTHROPIC_API_KEY}); sin clave, {@link #available()} es
 * falso. Un error de red o un estado que no es 2xx es {@link AiUnavailableException}: la función no cuenta en el tope.
 */
@Slf4j
@Component
public class AnthropicMessages {

    static final URI ENDPOINT = URI.create("https://api.anthropic.com/v1/messages");
    static final ObjectMapper JSON = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();

    private final AiProperties properties;
    private final HttpClient http;
    private final URI endpoint;

    @Autowired
    public AnthropicMessages(AiProperties properties) {
        this(properties, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build(), ENDPOINT);
    }

    AnthropicMessages(AiProperties properties, HttpClient http, URI endpoint) {
        this.properties = properties;
        this.http = http;
        this.endpoint = endpoint;
    }

    public boolean available() {
        return properties.enabled();
    }

    public String model() {
        return properties.model();
    }

    /** Envía el cuerpo (ya con modelo, mensajes y herramientas) y devuelve la respuesta. */
    public Map<String, Object> send(Map<String, Object> body) {
        try {
            return sendOnce(body);
        } catch (RetryableException ex) {
            log.info("Reintentando la petición a la IA: {}", ex.getMessage());
            sleep();
            try {
                return sendOnce(body);
            } catch (RetryableException again) {
                throw new AiUnavailableException(again.getMessage(), again.getCause());
            }
        }
    }

    private static void sleep() {
        try {
            Thread.sleep(1500);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    /** Errores que vale la pena reintentar una vez: red, demasiadas peticiones o servicio saturado. */
    static boolean retryable(int status) {
        return status == 429 || status == 529 || status >= 500;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> sendOnce(Map<String, Object> body) {
        HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(properties.timeout()))
                .header("x-api-key", properties.anthropicApiKey())
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
                .build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            throw new RetryableException("La IA no respondió: " + ex.getClass().getSimpleName(), ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new AiUnavailableException("La consulta a la IA se interrumpió.", ex);
        }
        if (response.statusCode() / 100 != 2) {
            String detail = response.body() == null ? "" : response.body();
            log.warn("La API de Anthropic respondió {}: {}", response.statusCode(),
                    detail.substring(0, Math.min(500, detail.length())));
            if (retryable(response.statusCode())) {
                throw new RetryableException("La IA respondió " + response.statusCode() + ".", null);
            }
            throw new AiUnavailableException("La IA respondió " + response.statusCode() + ".", null);
        }
        return JSON.readValue(response.body(), Map.class);
    }

    private static class RetryableException extends RuntimeException {
        RetryableException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** La IA no respondió (red, clave, saldo o tope de gasto agotado). */
    public static class AiUnavailableException extends RuntimeException {
        public AiUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
