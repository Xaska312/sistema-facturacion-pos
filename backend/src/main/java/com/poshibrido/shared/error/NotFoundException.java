package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

public class NotFoundException extends DomainException {

    public NotFoundException(String detail) {
        super(HttpStatus.NOT_FOUND, "No encontrado", detail);
    }
}
