package com.poshibrido.tenancy.infrastructure;

import com.poshibrido.tenancy.application.TenantRef;

import java.util.Optional;

/**
 * Tenant de la petición actual. ThreadLocal simple (no heredable): se asigna solo a partir
 * del claim {@code tid} del JWT y se limpia siempre en {@code finally}. Para tareas
 * {@code @Async} se propaga explícitamente con {@link TenantAwareTaskDecorator}.
 */
public final class TenantContext {

    private static final ThreadLocal<TenantRef> CURRENT = new ThreadLocal<>();

    private TenantContext() {
    }

    public static void set(TenantRef tenant) {
        CURRENT.set(tenant);
    }

    public static Optional<TenantRef> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static void clear() {
        CURRENT.remove();
    }
}
