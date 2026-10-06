package com.poshibrido.tenancy.application;

import com.poshibrido.tenancy.domain.BusinessType;
import com.poshibrido.tenancy.domain.Tenant;
import com.poshibrido.tenancy.domain.TenantStatus;

import java.util.UUID;

/**
 * Negocio en la lista de quien inicia sesión.
 *
 * @param suspensionReason motivo de la suspensión (solo si está suspendido), para mostrarlo a sus miembros
 * @param closedByOwner    suspendido porque su dueño lo cerró (no el administrador de plataforma)
 */
public record TenantSummary(UUID id, String slug, String legalName, String tradeName,
                            BusinessType businessType, TenantStatus status, boolean owner,
                            String suspensionReason, boolean closedByOwner) {

    public static TenantSummary of(Tenant tenant, UUID viewerId) {
        return new TenantSummary(tenant.getId(), tenant.getSlug(), tenant.getLegalName(), tenant.getTradeName(),
                tenant.getBusinessType(), tenant.getStatus(), tenant.isOwnedBy(viewerId),
                tenant.getSuspensionReason(), tenant.isClosedByOwner());
    }
}
