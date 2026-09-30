package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

public class ForbiddenException extends DomainException {

    public ForbiddenException(String detail) {
        super(HttpStatus.FORBIDDEN, "Acceso denegado", detail);
    }
}
