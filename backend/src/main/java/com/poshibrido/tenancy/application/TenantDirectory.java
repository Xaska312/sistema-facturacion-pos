package com.poshibrido.tenancy.application;

import com.poshibrido.identity.application.MembershipApi;
import com.poshibrido.tenancy.domain.Tenant;
import com.poshibrido.tenancy.domain.TenantStatus;
import com.poshibrido.tenancy.infrastructure.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class TenantDirectory implements TenantApi {

    private static final Duration CACHE_TTL = Duration.ofSeconds(30);

    private final TenantRepository tenants;
    private final MembershipApi memberships;
    private final ConcurrentHashMap<UUID, CachedTenant> cache = new ConcurrentHashMap<>();

    @Override
    @Transactional(readOnly = true)
    public Optional<TenantRef> findActive(UUID tenantId) {
        Instant now = Instant.now();
        CachedTenant cached = cache.get(tenantId);
        if (cached != null && cached.expiresAt().isAfter(now)) {
            return Optional.ofNullable(cached.ref());
        }
        TenantRef ref = tenants.findById(tenantId)
                .filter(t -> t.getStatus() == TenantStatus.ACTIVE)
                .map(t -> new TenantRef(t.getId(), t.getSlug(), t.getSchemaName()))
                .orElse(null);
        cache.put(tenantId, new CachedTenant(ref, now.plus(CACHE_TTL)));
        return Optional.ofNullable(ref);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TenantSummary> listVisibleTo(UUID userId) {
        Set<UUID> ids = memberships.activeTenantIds(userId);
        // Evita un IN vacío: un UUID aleatorio nunca coincide.
        Set<UUID> safeIds = ids.isEmpty() ? Set.of(UUID.randomUUID()) : ids;
        List<Tenant> visible = tenants.findVisibleTo(safeIds, userId);
        return visible.stream().map(t -> TenantSummary.of(t, userId)).toList();
    }

    public void evict(UUID tenantId) {
        cache.remove(tenantId);
    }

    private record CachedTenant(TenantRef ref, Instant expiresAt) {
    }
}
