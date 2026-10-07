package com.poshibrido.mail;

/** Falla al entregar un correo. {@code retryable}: vale la pena reintentar (red, 429, 5xx). */
public class MailDeliveryException extends RuntimeException {

    private final boolean retryable;

    public MailDeliveryException(String message, boolean retryable, Throwable cause) {
        super(message, cause);
        this.retryable = retryable;
    }

    public boolean isRetryable() {
        return retryable;
    }
}
