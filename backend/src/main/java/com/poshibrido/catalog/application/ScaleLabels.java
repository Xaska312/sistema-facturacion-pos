package com.poshibrido.catalog.application;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Etiquetas de báscula (fase 8e): EAN-13 = prefijo (2 o 20–28) + PLU + valor + dígito de control. El valor es el peso
 * (p. ej. en gramos con 3 decimales: 00750 = 0,750 kg) o el precio en pesos, según cómo esté configurada la báscula.
 */
public final class ScaleLabels {

    private ScaleLabels() {
    }

    public enum Kind { WEIGHT, PRICE }

    public record Format(boolean enabled, String prefix, int pluDigits, Kind kind, int decimals) {

        public int valueDigits() {
            return 12 - prefix.length() - pluDigits;
        }
    }

    /** {@code plu} sin ceros a la izquierda; {@code value} ya con sus decimales (kg o pesos). */
    public record Label(String plu, BigDecimal value) {
    }

    /** Vacío si el código no es una etiqueta de báscula con ese formato (o el formato está apagado). */
    public static Optional<Label> parse(String code, Format format) {
        if (format == null || !format.enabled() || code == null || !Ean13.isValid(code)
                || !code.startsWith(format.prefix())) {
            return Optional.empty();
        }
        int pluStart = format.prefix().length();
        int valueStart = pluStart + format.pluDigits();
        String plu = stripZeros(code.substring(pluStart, valueStart));
        if (plu.isEmpty()) {
            return Optional.empty();
        }
        BigDecimal value = new BigDecimal(code.substring(valueStart, 12)).movePointLeft(format.decimals());
        return Optional.of(new Label(plu, value));
    }

    /** "00123" → "123"; "000" → "". */
    public static String stripZeros(String digits) {
        int i = 0;
        while (i < digits.length() && digits.charAt(i) == '0') {
            i++;
        }
        return digits.substring(i);
    }
}
