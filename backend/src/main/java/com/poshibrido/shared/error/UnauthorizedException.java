package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

public class UnauthorizedException extends DomainException {

    public UnauthorizedException(String detail) {
        super(HttpStatus.UNAUTHORIZED, "No autenticado", detail);
    }
}
