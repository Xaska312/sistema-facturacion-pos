package com.poshibrido.shared.csv;

import java.math.BigDecimal;

/**
 * Lectura de números escritos a la colombiana o a la inglesa ("1.234,56", "1,234.56", "$ 2.500").
 * Regla para un único separador: si le siguen exactamente 3 dígitos es de miles; si no, es decimal
 * ("2,5" = 2.5; "2.500" = 2500).
 */
public final class Numbers {

    private Numbers() {
    }

    /** @return el número o {@code null} si el texto no es un número válido. */
    public static BigDecimal parseFlexible(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim().replace("$", "").replace(" ", "").replace("\u00A0", "");
        if (s.isEmpty()) {
            return null;
        }
        int lastDot = s.lastIndexOf('.');
        int lastComma = s.lastIndexOf(',');
        if (lastDot >= 0 && lastComma >= 0) {
            // El último separador es el decimal; el otro es de miles.
            if (lastComma > lastDot) {
                s = s.replace(".", "").replace(',', '.');
            } else {
                s = s.replace(",", "");
            }
        } else if (lastComma >= 0) {
            s = countOf(s, ',') > 1 || isThousands(s, lastComma) ? s.replace(",", "") : s.replace(',', '.');
        } else if (lastDot >= 0 && (countOf(s, '.') > 1 || isThousands(s, lastDot))) {
            s = s.replace(".", "");
        }
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    /**
     * Un único separador seguido de exactamente 3 dígitos se toma como separador de miles
     * ("2.500" = 2500, "1,000" = 1000): en pesos colombianos es lo habitual.
     */
    private static boolean isThousands(String s, int separatorIndex) {
        return s.length() - separatorIndex - 1 == 3 && separatorIndex > 0;
    }

    private static long countOf(String s, char c) {
        return s.chars().filter(ch -> ch == c).count();
    }
}
