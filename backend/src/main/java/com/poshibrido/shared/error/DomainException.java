package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

/**
 * Excepción base de dominio. El mensaje es seguro para mostrarse al usuario (en español);
 * el {@code GlobalExceptionHandler} lo traduce a ProblemDetail con el estado HTTP indicado.
 */
public abstract class DomainException extends RuntimeException {

    private final HttpStatus status;
    private final String title;

    protected DomainException(HttpStatus status, String title, String detail) {
        super(detail);
        this.status = status;
        this.title = title;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getTitle() {
        return title;
    }
}
