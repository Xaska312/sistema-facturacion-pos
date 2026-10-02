package com.poshibrido.tenancy.domain;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.persistence.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Getter
@Entity
@Table(name = "tenants", schema = "platform")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Tenant extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String slug;

    @Column(name = "schema_name", nullable = false, updatable = false)
    private String schemaName;

    @Column(name = "legal_name", nullable = false)
    private String legalName;

    @Column(name = "trade_name", nullable = false)
    private String tradeName;

    @Enumerated(EnumType.STRING)
    @Column(name = "business_type", nullable = false)
    private BusinessType businessType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TenantStatus status;

    @Column(name = "owner_user_id", nullable = false, updatable = false)
    private UUID ownerUserId;

    @Column(name = "failure_reason")
    private String failureReason;

    public static Tenant startProvisioning(String slug, String legalName, String tradeName,
                                           BusinessType businessType, UUID ownerUserId) {
        Tenant tenant = new Tenant();
        tenant.id = Ids.newId();
        tenant.slug = slug;
        tenant.schemaName = TenantSchemas.schemaForSlug(slug);
        tenant.legalName = legalName;
        tenant.tradeName = tradeName;
        tenant.businessType = businessType;
        tenant.ownerUserId = ownerUserId;
        tenant.status = TenantStatus.PROVISIONING;
        return tenant;
    }

    public boolean isOwnedBy(UUID userId) {
        return ownerUserId.equals(userId);
    }

    public void retryProvisioning() {
        this.status = TenantStatus.PROVISIONING;
        this.failureReason = null;
    }

    public void markActive() {
        this.status = TenantStatus.ACTIVE;
        this.failureReason = null;
    }

    public void markFailed(String reason) {
        this.status = TenantStatus.FAILED;
        this.failureReason = reason == null ? null : reason.substring(0, Math.min(reason.length(), 500));
    }
}
