package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

public class TooManyRequestsException extends DomainException {

    public TooManyRequestsException(String detail) {
        super(HttpStatus.TOO_MANY_REQUESTS, "Demasiadas solicitudes", detail);
    }
}
