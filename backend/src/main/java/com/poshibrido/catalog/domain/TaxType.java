package com.poshibrido.catalog.domain;

/** Tipos de impuesto. EXEMPT (exento) y EXCLUDED (excluido) siempre tienen tarifa 0. */
public enum TaxType {
    IVA,
    INC,
    EXEMPT,
    EXCLUDED;

    public boolean requiresZeroRate() {
        return this == EXEMPT || this == EXCLUDED;
    }
}
