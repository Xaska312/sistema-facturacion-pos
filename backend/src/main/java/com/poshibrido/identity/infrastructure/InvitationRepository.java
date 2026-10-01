package com.poshibrido.identity.infrastructure;

import com.poshibrido.identity.domain.Invitation;
import com.poshibrido.identity.domain.InvitationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface InvitationRepository extends JpaRepository<Invitation, UUID> {

    Optional<Invitation> findByTokenHash(String tokenHash);

    Optional<Invitation> findByIdAndTenantId(UUID id, UUID tenantId);

    Optional<Invitation> findByTenantIdAndEmailAndStatus(UUID tenantId, String email, InvitationStatus status);

    Page<Invitation> findByTenantId(UUID tenantId, Pageable pageable);

    Page<Invitation> findByTenantIdAndStatus(UUID tenantId, InvitationStatus status, Pageable pageable);
}
