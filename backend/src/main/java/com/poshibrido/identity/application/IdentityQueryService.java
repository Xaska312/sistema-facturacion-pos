package com.poshibrido.identity.application;

import com.poshibrido.identity.domain.Membership;
import com.poshibrido.identity.domain.MembershipStatus;
import com.poshibrido.identity.domain.User;
import com.poshibrido.identity.infrastructure.MembershipRepository;
import com.poshibrido.identity.infrastructure.UserRepository;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class IdentityQueryService implements UserApi, MembershipApi {

    private final UserRepository users;
    private final MembershipRepository memberships;

    @Override
    @Transactional(readOnly = true)
    public UserSummary requireActive(UUID userId) {
        User user = users.findById(userId).orElseThrow(() -> new NotFoundException("Usuario no encontrado."));
        if (!user.isActive()) {
            throw new ForbiddenException("La cuenta no está activa.");
        }
        return UserSummary.of(user);
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> activeTenantIds(UUID userId) {
        return memberships.findByUserIdAndStatus(userId, MembershipStatus.ACTIVE).stream()
                .map(Membership::getTenantId)
                .collect(Collectors.toSet());
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void grantActive(UUID userId, UUID tenantId) {
        memberships.findByUserIdAndTenantId(userId, tenantId)
                .ifPresentOrElse(Membership::activate,
                        () -> memberships.save(Membership.active(userId, tenantId)));
    }
}
