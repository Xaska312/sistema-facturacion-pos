package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

public class ConflictException extends DomainException {

    public ConflictException(String detail) {
        super(HttpStatus.CONFLICT, "Conflicto", detail);
    }
}
