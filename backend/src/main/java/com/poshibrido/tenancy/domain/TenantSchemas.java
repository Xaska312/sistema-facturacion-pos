package com.poshibrido.tenancy.domain;

import java.util.regex.Pattern;

/**
 * Única fuente de verdad para validar slugs y nombres de schema antes de usarlos en SQL.
 */
public final class TenantSchemas {

    public static final String PREFIX = "t_";
    /** Schema usado para validar el modelo JPA al arrancar; nunca pertenece a un negocio. */
    public static final String TEMPLATE_SCHEMA = "tenant_template";
    public static final String PLATFORM_SCHEMA = "platform";

    private static final Pattern SLUG = Pattern.compile("^[a-z][a-z0-9_]{2,40}$");
    private static final Pattern SCHEMA = Pattern.compile("^t_[a-z][a-z0-9_]{2,40}$");

    private TenantSchemas() {
    }

    public static boolean isValidSlug(String slug) {
        return slug != null && SLUG.matcher(slug).matches();
    }

    public static String schemaForSlug(String slug) {
        if (!isValidSlug(slug)) {
            throw new IllegalArgumentException("Slug de negocio inválido");
        }
        return PREFIX + slug;
    }

    /**
     * Valida que el nombre corresponda a un schema de tenant. Lanza excepción si no, para que
     * ningún texto sin validar llegue a una sentencia SQL.
     */
    public static String requireTenantSchema(String schema) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) {
            throw new IllegalArgumentException("Nombre de schema de tenant inválido");
        }
        return schema;
    }
}
