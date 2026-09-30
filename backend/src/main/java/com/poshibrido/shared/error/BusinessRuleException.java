package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

public class BusinessRuleException extends DomainException {

    public BusinessRuleException(String detail) {
        super(HttpStatus.UNPROCESSABLE_ENTITY, "Regla de negocio", detail);
    }
}
