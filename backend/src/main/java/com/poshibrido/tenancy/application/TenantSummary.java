package com.poshibrido.tenancy.application;

import com.poshibrido.tenancy.domain.BusinessType;
import com.poshibrido.tenancy.domain.Tenant;
import com.poshibrido.tenancy.domain.TenantStatus;

import java.util.UUID;

public record TenantSummary(UUID id, String slug, String legalName, String tradeName,
                            BusinessType businessType, TenantStatus status, boolean owner) {

    public static TenantSummary of(Tenant tenant, UUID viewerId) {
        return new TenantSummary(tenant.getId(), tenant.getSlug(), tenant.getLegalName(), tenant.getTradeName(),
                tenant.getBusinessType(), tenant.getStatus(), tenant.isOwnedBy(viewerId));
    }
}
