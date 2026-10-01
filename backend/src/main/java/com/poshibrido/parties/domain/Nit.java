package com.poshibrido.parties.domain;

/**
 * Dígito de verificación del NIT según el algoritmo de la DIAN (módulo 11 con pesos
 * 3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71 aplicados de derecha a izquierda).
 */
public final class Nit {

    private static final int[] WEIGHTS = {3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71};

    private Nit() {
    }

    public static int verificationDigit(String nit) {
        if (nit == null || !nit.matches("^\\d{1,15}$")) {
            throw new IllegalArgumentException("El NIT debe tener entre 1 y 15 dígitos");
        }
        int sum = 0;
        for (int i = 0; i < nit.length(); i++) {
            int digit = nit.charAt(nit.length() - 1 - i) - '0';
            sum += digit * WEIGHTS[i];
        }
        int remainder = sum % 11;
        return remainder < 2 ? remainder : 11 - remainder;
    }
}
