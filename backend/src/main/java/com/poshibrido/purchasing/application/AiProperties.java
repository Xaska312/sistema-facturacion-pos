package com.poshibrido.purchasing.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Lectura de facturas con IA (decisión 295). Sin {@code anthropicApiKey} la lectura está apagada (la carga del XML
 * sigue igual). {@code invoiceModel}: el modelo de Claude que lee (Haiku: rápido y económico).
 */
@ConfigurationProperties(prefix = "app.ai")
public record AiProperties(String anthropicApiKey, String invoiceModel, int timeoutSeconds) {

    public boolean enabled() {
        return anthropicApiKey != null && !anthropicApiKey.isBlank();
    }

    public String model() {
        return invoiceModel == null || invoiceModel.isBlank() ? "claude-haiku-5-5" : invoiceModel;
    }

    public int timeout() {
        return timeoutSeconds <= 0 ? 90 : timeoutSeconds;
    }
}
