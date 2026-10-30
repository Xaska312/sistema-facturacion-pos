package com.poshibrido.tenancy.domain;

import java.util.Arrays;
import java.util.Collection;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Módulo que el dueño prende o apaga (Fase 12a, decisión 267). Lo demás (vender, caja, ventas, productos, inventario,
 * terceros, reportes, configuración) es la base y siempre está.
 *
 * <p>Apagar un módulo no borra nada: sus permisos salen del token ({@link #effectivePermissions}) y se agrega la
 * autoridad {@code module:<código>} de cada módulo encendido, para las reglas que no tienen permiso propio (tallas,
 * báscula, vender a fiado).
 */
public enum BusinessModule {
    /** Fiados (Fase 10a). */
    CREDIT("credit:read", "credit:manage", "credit:collect"),
    /** Pedidos por encargo (Fase 10b). */
    ORDERS("orders:read", "orders:create", "orders:manage"),
    /** Cotizaciones (Fase 10c). */
    QUOTES("quotes:read", "quotes:create"),
    /** Tallas y colores (Fase 8d): crear modelos y agregarles variantes. */
    VARIANTS,
    /** Báscula (Fase 8e): etiquetas y PLU. */
    SCALE,
    /** Adiciones (Fase 12b-1): tamaños, extras con precio, opciones y notas por producto en el POS. */
    MODIFIERS("modifiers:manage"),
    /** Mesas y cuentas abiertas (Fase 12b-2): mesa, para llevar y domicilio. */
    TABLES("tables:operate", "tables:manage", "tables:void"),
    /** Cocina y comandas (Fase 12b-3): estaciones, enviar lo pedido en las cuentas e imprimir comandas. Necesita Mesas. */
    KITCHEN("kitchen:send", "kitchen:manage", "kitchen:view");

    private static final String AUTHORITY_PREFIX = "module:";

    private final Set<String> permissions;

    BusinessModule(String... permissions) {
        this.permissions = Set.of(permissions);
    }

    /** Permisos de roles que solo valen con el módulo encendido. */
    public Set<String> permissions() {
        return permissions;
    }

    /** Autoridad del token cuando el módulo está encendido, p. ej. {@code module:credit}. */
    public String authority() {
        return AUTHORITY_PREFIX + name().toLowerCase(Locale.ROOT);
    }

    /** Módulo que este necesita encendido, si necesita alguno (Cocina se alimenta de las cuentas de Mesas). */
    public Optional<BusinessModule> requires() {
        return this == KITCHEN ? Optional.of(TABLES) : Optional.empty();
    }

    /** Primer módulo encendido al que le falta el que necesita, si hay alguno. */
    public static Optional<BusinessModule> missingRequirement(Set<BusinessModule> enabled) {
        return enabled.stream().sorted()
                .filter(m -> m.requires().map(r -> !enabled.contains(r)).orElse(false))
                .findFirst();
    }

    /** Módulo del que depende un permiso de rol, si depende de alguno. */
    public static Optional<BusinessModule> owning(String permission) {
        return Arrays.stream(values()).filter(m -> m.permissions.contains(permission)).findFirst();
    }

    /**
     * Permisos del token: los de los roles, sin los de módulos apagados, más la autoridad de cada módulo encendido.
     */
    public static List<String> effectivePermissions(Collection<String> rolePermissions, Set<BusinessModule> enabled) {
        Set<String> result = new LinkedHashSet<>();
        for (String permission : rolePermissions) {
            if (owning(permission).map(enabled::contains).orElse(true)) {
                result.add(permission);
            }
        }
        enabled.stream().sorted().forEach(m -> result.add(m.authority()));
        return List.copyOf(result);
    }

    /** "CREDIT,ORDERS" ↔ conjunto; los códigos desconocidos se ignoran (un módulo retirado no rompe la lectura). */
    public static Set<BusinessModule> parse(String csv) {
        Set<BusinessModule> result = EnumSet.noneOf(BusinessModule.class);
        if (csv == null || csv.isBlank()) {
            return result;
        }
        for (String code : csv.split(",")) {
            Arrays.stream(values()).filter(m -> m.name().equals(code.trim())).findFirst().ifPresent(result::add);
        }
        return result;
    }

    public static String format(Set<BusinessModule> modules) {
        return modules.stream().sorted().map(Enum::name).collect(Collectors.joining(","));
    }
}
