package com.poshibrido.parties.domain;

import java.util.regex.Pattern;

/** Tipos de documento colombianos con su formato. */
public enum DocumentType {
    CC("Cédula de ciudadanía", "^\\d{3,10}$"),
    CE("Cédula de extranjería", "^[A-Za-z0-9]{3,15}$"),
    NIT("NIT", "^\\d{5,15}$"),
    PASSPORT("Pasaporte", "^[A-Za-z0-9]{4,20}$"),
    TI("Tarjeta de identidad", "^\\d{6,11}$"),
    PEP("Permiso especial de permanencia", "^[A-Za-z0-9]{4,20}$");

    private final String label;
    private final Pattern format;

    DocumentType(String label, String regex) {
        this.label = label;
        this.format = Pattern.compile(regex);
    }

    public String label() {
        return label;
    }

    public boolean accepts(String number) {
        return number != null && format.matcher(number).matches();
    }
}
