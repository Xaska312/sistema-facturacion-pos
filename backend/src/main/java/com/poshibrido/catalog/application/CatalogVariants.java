package com.poshibrido.catalog.application;

import java.text.Normalizer;
import java.util.Locale;

/** Nombres y SKU de las variantes de un modelo (fase 8d). */
public final class CatalogVariants {

    private CatalogVariants() {
    }

    /**
     * "Tenis Runner" + "38" + "Negro" → "Tenis Runner T38 Negro"; las tallas en letras van sin la T:
     * "Camiseta" + "XL" → "Camiseta XL".
     */
    public static String name(String modelName, String size, String color) {
        String sizeText = !size.isEmpty() && Character.isDigit(size.charAt(0)) ? "T" + size : size;
        return modelName + " " + sizeText + (color == null ? "" : " " + color);
    }

    /** "RUN" + "38" + "NEGRO" → "RUN-38-NEGRO". */
    public static String sku(String prefix, String size, String colorToken) {
        return prefix + "-" + token(size, 10) + (colorToken == null ? "" : "-" + colorToken);
    }

    /** Mayúsculas sin tildes, solo letras, números y punto, hasta {@code max} caracteres: "Azul cielo" → "AZULCI". */
    public static String token(String text, int max) {
        String plain = Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9.]", "");
        return plain.length() > max ? plain.substring(0, max) : plain;
    }
}
