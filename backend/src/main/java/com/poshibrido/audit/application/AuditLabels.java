package com.poshibrido.audit.application;

import java.util.Map;

/**
 * Nombres en español de los módulos y acciones de la auditoría (para el CSV). El frontend tiene la misma lista en
 * {@code features/audit/audit-labels.ts}: si se agrega una acción, actualizar ambos.
 */
public final class AuditLabels {

    private static final Map<String, String> ENTITIES = Map.ofEntries(
            Map.entry("audit", "Auditoría"),
            Map.entry("branch", "Sucursal"),
            Map.entry("business", "Negocio"),
            Map.entry("business_settings", "Ajustes del negocio"),
            Map.entry("cash_movement", "Movimiento de caja"),
            Map.entry("cash_register", "Caja"),
            Map.entry("cash_session", "Turno de caja"),
            Map.entry("category", "Categoría"),
            Map.entry("customer", "Cliente"),
            Map.entry("inventory_document", "Documento de inventario"),
            Map.entry("invitation", "Invitación"),
            Map.entry("member", "Equipo"),
            Map.entry("price_list", "Lista de precios"),
            Map.entry("product", "Producto"),
            Map.entry("report", "Reporte"),
            Map.entry("role", "Rol"),
            Map.entry("sale", "Venta"),
            Map.entry("session", "Sesión"),
            Map.entry("supplier", "Proveedor"),
            Map.entry("tax", "Impuesto"),
            Map.entry("unit", "Unidad de medida"));

    /** Sustantivo en minúscula para armar "Creó producto", "Desactivó caja"… */
    private static final Map<String, String> NOUNS = Map.ofEntries(
            Map.entry("branch", "sucursal"),
            Map.entry("cash_register", "caja"),
            Map.entry("category", "categoría"),
            Map.entry("customer", "cliente"),
            Map.entry("member", "miembro del equipo"),
            Map.entry("price_list", "lista de precios"),
            Map.entry("product", "producto"),
            Map.entry("role", "rol"),
            Map.entry("supplier", "proveedor"),
            Map.entry("tax", "impuesto"),
            Map.entry("unit", "unidad de medida"));

    private static final Map<String, String> ACTIONS = Map.ofEntries(
            Map.entry("AUDIT_EXPORTED", "Exportó la auditoría"),
            Map.entry("BUSINESS_CLOSED", "Eliminó (cerró) el negocio"),
            Map.entry("BUSINESS_CREATED", "Creó el negocio"),
            Map.entry("BUSINESS_REACTIVATED", "Reactivó el negocio"),
            Map.entry("BUSINESS_SUSPENDED", "Suspendió el negocio"),
            Map.entry("CASH_MOVEMENT_CREATED", "Registró un movimiento de caja"),
            Map.entry("CASH_SESSION_CLOSED", "Cerró caja"),
            Map.entry("CASH_SESSION_OPENED", "Abrió caja"),
            Map.entry("INVENTORY_DOCUMENT_CREATED", "Registró un documento de inventario"),
            Map.entry("INVITATION_ACCEPTED", "Aceptó una invitación"),
            Map.entry("INVITATION_CREATED", "Invitó a una persona"),
            Map.entry("INVITATION_REVOKED", "Anuló una invitación"),
            Map.entry("PRODUCTS_IMPORTED", "Importó productos"),
            Map.entry("REPORT_EXPORTED", "Exportó un reporte"),
            Map.entry("SALE_CREATED", "Registró una venta"),
            Map.entry("SALE_VOIDED", "Anuló una venta"),
            Map.entry("SESSION_ENDED", "Cerró sesión"),
            Map.entry("SESSION_STARTED", "Entró al negocio"),
            Map.entry("SETTINGS_UPDATED", "Cambió los ajustes del negocio"),
            Map.entry("STOCK_LEVELS_UPDATED", "Cambió existencias mínimas y máximas"),
            Map.entry("TENANT_PROVISIONED", "Quedó como dueño del negocio"));

    private static final Map<String, String> VERBS = Map.of(
            "CREATED", "Creó",
            "UPDATED", "Modificó",
            "ACTIVATED", "Activó",
            "DEACTIVATED", "Desactivó",
            "DELETED", "Eliminó");

    private AuditLabels() {
    }

    public static String entity(String entity) {
        return entity == null ? null : ENTITIES.getOrDefault(entity, entity);
    }

    public static String action(String action, String entity) {
        if (action == null) {
            return null;
        }
        String known = ACTIONS.get(action);
        if (known != null) {
            return known;
        }
        int cut = action.lastIndexOf('_');
        String verb = cut < 0 ? null : VERBS.get(action.substring(cut + 1));
        if (verb == null) {
            return action;
        }
        String noun = entity == null ? null : NOUNS.get(entity);
        return noun == null ? verb : verb + " " + noun;
    }
}
