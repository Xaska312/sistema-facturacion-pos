package com.poshibrido.catalog.application;

import com.poshibrido.shared.error.BusinessRuleException;

import java.util.Locale;
import java.util.regex.Pattern;

/** Normalización y validación de códigos del catálogo. */
public final class CatalogCodes {

    private static final Pattern BARCODE = Pattern.compile("^[A-Za-z0-9.\\-]{1,48}$");
    private static final Pattern SKU = Pattern.compile("^[A-Za-z0-9._\\-/]{1,40}$");

    private CatalogCodes() {
    }

    public static String barcode(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (!BARCODE.matcher(value).matches()) {
            throw new BusinessRuleException("Código de barras inválido: '" + value
                    + "'. Usa letras, números, '.' o '-' (máximo 48).");
        }
        return value;
    }

    public static String sku(String raw) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (!SKU.matcher(value).matches()) {
            throw new BusinessRuleException("SKU inválido: '" + value
                    + "'. Usa letras, números, '.', '_', '-' o '/' (máximo 40).");
        }
        return value;
    }

    public static String code(String raw) {
        return raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
    }
}
