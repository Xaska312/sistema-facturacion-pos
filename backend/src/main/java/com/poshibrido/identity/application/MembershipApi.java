package com.poshibrido.identity.application;

import java.util.Set;
import java.util.UUID;

public interface MembershipApi {

    Set<UUID> activeTenantIds(UUID userId);

    boolean isActiveMember(UUID userId, UUID tenantId);

    /** Crea o reactiva la membresía. Debe ejecutarse dentro de una transacción. */
    void grantActive(UUID userId, UUID tenantId);
}
