package com.poshibrido.purchasing.application;

import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedInvoice;

import java.util.List;

/**
 * Lee una factura de compra a partir de sus fotos o su PDF (decisión 295). La implementación real usa Claude
 * ({@link AnthropicInvoiceReader}); en las pruebas se reemplaza. Nunca registra nada: solo devuelve lo que leyó.
 */
public interface InvoiceReader {

    /** Una foto (JPEG ya reducida) o el PDF. */
    record Page(String mediaType, byte[] content) {
    }

    /**
     * @param invoice lo leído, o null si no se pudo leer
     * @param problem por qué no se pudo leer (para el usuario), o null
     */
    record Result(ParsedInvoice invoice, String problem, String model, int inputTokens, int outputTokens) {

        public boolean readable() {
            return invoice != null;
        }
    }

    /** Está configurada (hay llave de la API). */
    boolean available();

    /**
     * @throws ReaderUnavailableException si el servicio no respondió (no cuenta como lectura)
     */
    Result read(List<Page> pages);

    /** El servicio de lectura no respondió o rechazó la petición. */
    class ReaderUnavailableException extends RuntimeException {
        public ReaderUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
