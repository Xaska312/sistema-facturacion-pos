package com.poshibrido.catalog.application;

/**
 * Utilidades EAN-13. Los códigos internos usan el prefijo 29 (rango 20–29 reservado para uso interno
 * en tienda), seguido de 10 dígitos de secuencia y el dígito de control.
 */
public final class Ean13 {

    public static final String INTERNAL_PREFIX = "29";

    private Ean13() {
    }

    /** Dígito de control para los 12 primeros dígitos. */
    public static int checkDigit(String first12) {
        if (first12 == null || !first12.matches("^\\d{12}$")) {
            throw new IllegalArgumentException("Se esperan 12 dígitos");
        }
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            int digit = first12.charAt(i) - '0';
            sum += (i % 2 == 0) ? digit : digit * 3;
        }
        return (10 - sum % 10) % 10;
    }

    public static boolean isValid(String code) {
        return code != null && code.matches("^\\d{13}$")
                && checkDigit(code.substring(0, 12)) == code.charAt(12) - '0';
    }

    public static String internal(long sequence) {
        if (sequence < 0 || sequence > 9_999_999_999L) {
            throw new IllegalArgumentException("Secuencia fuera de rango");
        }
        String first12 = INTERNAL_PREFIX + String.format("%010d", sequence);
        return first12 + checkDigit(first12);
    }
}
