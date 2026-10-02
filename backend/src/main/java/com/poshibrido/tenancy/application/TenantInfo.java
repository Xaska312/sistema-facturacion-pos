package com.poshibrido.tenancy.application;

import com.poshibrido.tenancy.domain.TenantStatus;

import java.util.UUID;

/**
 * Datos básicos de un negocio para otros módulos.
 */
public record TenantInfo(UUID id, String slug, String schema, String tradeName, TenantStatus status,
                         UUID ownerUserId) {

    public TenantRef ref() {
        return new TenantRef(id, slug, schema);
    }
}
