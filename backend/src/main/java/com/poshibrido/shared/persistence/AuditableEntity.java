package com.poshibrido.shared.persistence;

import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Version;
import lombok.Getter;

import java.time.Instant;
import java.util.UUID;

/**
 * Auditoría base: created_at/by, updated_at/by y versión para bloqueo optimista.
 */
@Getter
@MappedSuperclass
public abstract class AuditableEntity {

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "created_by", updatable = false)
    private UUID createdBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        UUID actor = CurrentActor.userId().orElse(null);
        this.createdAt = now;
        this.updatedAt = now;
        this.createdBy = actor;
        this.updatedBy = actor;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
        this.updatedBy = CurrentActor.userId().orElse(null);
    }
}
