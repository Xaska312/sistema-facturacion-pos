package com.poshibrido.tenancy.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * API pública del módulo de tenancy para otros módulos.
 */
public interface TenantApi {

    /** Negocio en estado ACTIVE (con caché corta). Vacío si no existe o no está activo. */
    Optional<TenantRef> findActive(UUID tenantId);

    /** Negocios donde el usuario tiene membresía activa o de los que es dueño. */
    List<TenantSummary> listVisibleTo(UUID userId);

    /** Datos del negocio en cualquier estado (sin caché). */
    Optional<TenantInfo> findInfo(UUID tenantId);
}
