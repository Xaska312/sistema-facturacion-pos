package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

public class BusinessRuleException extends DomainException {

    public BusinessRuleException(String detail) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, "Regla de negocio", detail);
    }
}
