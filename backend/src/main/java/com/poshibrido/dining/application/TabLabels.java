package com.poshibrido.dining.application;

/** Nombre corto de una cuenta para las baldosas, la cuenta y la nota de la venta (Fase 12b-2). */
public final class TabLabels {

    private TabLabels() {
    }

    /** "Mesa 4" (o "Barra 2" si la mesa ya tiene nombre propio), "Para llevar · Juan", "Domicilio · Ana", "#12". */
    public static String label(String kind, long number, String tableName, String customerName) {
        String who = customerName == null || customerName.isBlank() ? "#" + number : customerName.trim();
        return switch (kind) {
            case "TABLE" -> tableName == null ? "Mesa" : tableName.matches("\\d+") ? "Mesa " + tableName : tableName;
            case "TAKEAWAY" -> "Para llevar · " + who;
            case "DELIVERY" -> "Domicilio · " + who;
            default -> "#" + number;
        };
    }
}
