package com.poshibrido.identity.infrastructure;

import com.poshibrido.identity.domain.Membership;
import com.poshibrido.identity.domain.MembershipStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MembershipRepository extends JpaRepository<Membership, UUID> {

    Optional<Membership> findByUserIdAndTenantId(UUID userId, UUID tenantId);

    List<Membership> findByUserIdAndStatus(UUID userId, MembershipStatus status);
}
