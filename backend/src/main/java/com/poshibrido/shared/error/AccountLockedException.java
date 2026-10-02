package com.poshibrido.shared.error;

import org.springframework.http.HttpStatus;

public class AccountLockedException extends DomainException {

    public AccountLockedException(String detail) {
        super(HttpStatus.LOCKED, "Cuenta bloqueada", detail);
    }
}
