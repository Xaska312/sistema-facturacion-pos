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

import java.time.Instant;
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

    @Column(name = "suspended_at")
    private Instant suspendedAt;

    @Column(name = "suspended_by")
    private UUID suspendedBy;

    @Column(name = "suspension_reason")
    private String suspensionReason;

    @Column(name = "closed_by_owner", nullable = false)
    private boolean closedByOwner;

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

    /**
     * Suspende un negocio activo: lo hace el administrador de plataforma ({@code byOwner = false}) o lo cierra su
     * dueño ({@code byOwner = true}).
     */
    public void suspend(UUID by, String reason, Instant now, boolean byOwner) {
        if (status != TenantStatus.ACTIVE) {
            throw new IllegalStateException("Solo se suspende un negocio activo");
        }
        this.status = TenantStatus.SUSPENDED;
        this.suspendedAt = now;
        this.suspendedBy = by;
        this.closedByOwner = byOwner;
        this.suspensionReason = reason == null || reason.isBlank() ? null
                : reason.trim().substring(0, Math.min(reason.trim().length(), 300));
    }

    public void reactivate() {
        if (status != TenantStatus.SUSPENDED) {
            throw new IllegalStateException("Solo se reactiva un negocio suspendido");
        }
        this.status = TenantStatus.ACTIVE;
        this.suspendedAt = null;
        this.suspendedBy = null;
        this.suspensionReason = null;
        this.closedByOwner = false;
    }

    public void markFailed(String reason) {
        this.status = TenantStatus.FAILED;
        this.failureReason = reason == null ? null : reason.substring(0, Math.min(reason.length(), 500));
    }
}
