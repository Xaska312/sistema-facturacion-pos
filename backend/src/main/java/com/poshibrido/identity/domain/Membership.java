package com.poshibrido.identity.domain;

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
@Table(name = "memberships", schema = "platform")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Membership extends AuditableEntity {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MembershipStatus status;

    public static Membership active(UUID userId, UUID tenantId) {
        Membership membership = new Membership();
        membership.id = Ids.newId();
        membership.userId = userId;
        membership.tenantId = tenantId;
        membership.status = MembershipStatus.ACTIVE;
        return membership;
    }

    public void activate() {
        this.status = MembershipStatus.ACTIVE;
    }

    public boolean isActive() {
        return status == MembershipStatus.ACTIVE;
    }
}
