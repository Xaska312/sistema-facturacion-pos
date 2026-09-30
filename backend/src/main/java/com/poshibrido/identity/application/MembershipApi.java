package com.poshibrido.identity.application;

import java.util.Set;
import java.util.UUID;

public interface MembershipApi {

    Set<UUID> activeTenantIds(UUID userId);

    /** Crea o reactiva la membresía. Debe ejecutarse dentro de una transacción. */
    void grantActive(UUID userId, UUID tenantId);
}
