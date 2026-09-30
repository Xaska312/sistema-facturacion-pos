package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

public class ServiceUnavailableException extends DomainException {

    public ServiceUnavailableException(String detail) {
        super(HttpStatus.SERVICE_UNAVAILABLE, "Servicio no disponible", detail);
    }
}
