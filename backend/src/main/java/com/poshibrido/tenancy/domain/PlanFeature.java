package com.poshibrido.tenancy.domain;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Función que depende del plan (decisión 288), no un módulo que el dueño prende: el plan (o un extra que da el
 * administrador) la incluye o no. Sin ella, sus permisos salen del token, como los de un módulo apagado, y la
 * autoridad {@code plan:<código>} solo está si el plan la incluye.
 */
public enum PlanFeature {
    /** Compras, recepción técnica y cuentas por pagar (Fase 13-2). */
    PURCHASES("purchases:read", "purchases:receive", "purchases:pay", "purchases:import"),
    /** XASKA Impresora: tiquete directo en la térmica y "Abrir cajón" (decisión 286). */
    DIRECT_PRINT("cash:drawer"),
    /** Auditoría del negocio. */
    AUDIT("audit:read"),
    /** Traslados entre sedes. */
    TRANSFERS("inventory:transfer"),
    /** Caja por zona de mesas (decisión 285). */
    ZONE_REGISTERS,
    /**
     * XASKA IA (decisión 295): adicional pagado que no trae ningún plan; lo da el administrador como extra. Cada
     * función tiene su tope al mes ({@code platform.ai_allowances}). Hoy: leer facturas de compra en foto o PDF.
     */
    AI("purchases:scan");

    private static final String AUTHORITY_PREFIX = "plan:";

    private final Set<String> permissions;

    PlanFeature(String... permissions) {
        this.permissions = Set.of(permissions);
    }

    public Set<String> permissions() {
        return permissions;
    }

    /** {@code plan:direct-print}. */
    public String authority() {
        return AUTHORITY_PREFIX + name().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    public static Optional<PlanFeature> owning(String permission) {
        return Arrays.stream(values()).filter(f -> f.permissions.contains(permission)).findFirst();
    }

    public static Set<PlanFeature> all() {
        return EnumSet.allOf(PlanFeature.class);
    }

    /** Lo que se le deja a un negocio sin datos de suscripción: todo menos los adicionales pagados (XASKA IA). */
    public static Set<PlanFeature> allButAddOns() {
        return EnumSet.complementOf(EnumSet.of(AI));
    }

    /** "PURCHASES,AUDIT" ↔ conjunto; los códigos desconocidos se ignoran. */
    public static Set<PlanFeature> parse(String csv) {
        Set<PlanFeature> result = EnumSet.noneOf(PlanFeature.class);
        if (csv == null || csv.isBlank()) {
            return result;
        }
        for (String code : csv.split(",")) {
            Arrays.stream(values()).filter(f -> f.name().equals(code.trim())).findFirst().ifPresent(result::add);
        }
        return result;
    }

    public static String format(Set<PlanFeature> features) {
        return features.stream().sorted().map(Enum::name).collect(Collectors.joining(","));
    }
}
