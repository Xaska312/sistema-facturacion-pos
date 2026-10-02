package com.poshibrido.tenancy.domain;

public enum BusinessType {
    RETAIL,
    PHARMACY,
    RESTAURANT,
    SERVICES;

    /** Tipos habilitados para crear negocios en esta versión. */
    public boolean isAvailable() {
        return this == RETAIL;
    }
}
