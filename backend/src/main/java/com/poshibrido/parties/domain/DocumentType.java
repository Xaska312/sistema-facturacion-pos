package com.poshibrido.parties.domain;

import java.util.regex.Pattern;

/**
 * Tipos de documento de identificación con su formato, su código en la tabla de la DIAN (para la facturación
 * electrónica) y su abreviatura para el tiquete.
 */
public enum DocumentType {
    CC("Cédula de ciudadanía", "^\\d{3,10}$", "13", "CC"),
    CE("Cédula de extranjería", "^[A-Za-z0-9]{3,15}$", "22", "CE"),
    NIT("NIT", "^\\d{5,15}$", "31", "NIT"),
    PASSPORT("Pasaporte", "^[A-Za-z0-9]{4,20}$", "41", "PA"),
    TI("Tarjeta de identidad", "^\\d{6,11}$", "12", "TI"),
    PEP("Permiso especial de permanencia", "^[A-Za-z0-9]{4,20}$", "47", "PEP"),
    PPT("Permiso por protección temporal", "^[A-Za-z0-9]{4,20}$", "48", "PPT"),
    TE("Tarjeta de extranjería", "^[A-Za-z0-9]{3,15}$", "21", "TE"),
    RC("Registro civil", "^[A-Za-z0-9]{4,20}$", "11", "RC"),
    NUIP("NUIP", "^\\d{6,11}$", "91", "NUIP"),
    FOREIGN_ID("Documento de identificación extranjero", "^[A-Za-z0-9-]{3,20}$", "42", "DIE"),
    /** Empresa del exterior: persona jurídica sin dígito de verificación. */
    FOREIGN_NIT("NIT de otro país", "^[A-Za-z0-9-]{3,20}$", "50", "NIT ext.");

    private final String label;
    private final Pattern format;
    private final String dianCode;
    private final String shortLabel;

    DocumentType(String label, String regex, String dianCode, String shortLabel) {
        this.label = label;
        this.format = Pattern.compile(regex);
        this.dianCode = dianCode;
        this.shortLabel = shortLabel;
    }

    public String label() {
        return label;
    }

    /** Código del tipo de documento en la tabla de la DIAN. */
    public String dianCode() {
        return dianCode;
    }

    public String shortLabel() {
        return shortLabel;
    }

    /** Documentos con los que se identifica una persona jurídica. */
    public boolean forLegalPerson() {
        return this == NIT || this == FOREIGN_NIT;
    }

    public boolean accepts(String number) {
        return number != null && format.matcher(number).matches();
    }
}
