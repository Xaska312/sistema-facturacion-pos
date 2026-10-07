package com.poshibrido.identity.application;

import com.poshibrido.identity.domain.Membership;
import com.poshibrido.identity.domain.MembershipStatus;
import com.poshibrido.identity.domain.User;
import com.poshibrido.identity.infrastructure.MembershipRepository;
import com.poshibrido.identity.infrastructure.UserRepository;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class IdentityQueryService implements UserApi, MembershipApi {

    private final UserRepository users;
    private final MembershipRepository memberships;
    private final PasswordEncoder passwordEncoder;

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
    public Map<UUID, UserSummary> findSummaries(Collection<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return users.findAllById(userIds).stream()
                .collect(Collectors.toMap(u -> u.getId(), u -> UserSummary.of(u)));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UserSummary> findByEmail(String email) {
        return users.findByEmail(User.normalizeEmail(email)).map(u -> UserSummary.of(u));
    }

    @Override
    @Transactional(readOnly = true)
    public boolean passwordMatches(UUID userId, String rawPassword) {
        if (rawPassword == null || rawPassword.isEmpty()) {
            return false;
        }
        return users.findById(userId).map(u -> passwordEncoder.matches(rawPassword, u.getPasswordHash())).orElse(false);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void markEmailVerified(UUID userId) {
        users.findById(userId).ifPresent(u -> u.markEmailVerified(Instant.now()));
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isActiveMember(UUID userId, UUID tenantId) {
        return memberships.findByUserIdAndTenantId(userId, tenantId).map(m -> m.isActive()).orElse(false);
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> activeTenantIds(UUID userId) {
        return memberships.findByUserIdAndStatus(userId, MembershipStatus.ACTIVE).stream()
                .map(m -> m.getTenantId())
                .collect(Collectors.toSet());
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void grantActive(UUID userId, UUID tenantId) {
        memberships.findByUserIdAndTenantId(userId, tenantId)
                .ifPresentOrElse(m -> m.activate(),
                        () -> memberships.save(Membership.active(userId, tenantId)));
    }
}
