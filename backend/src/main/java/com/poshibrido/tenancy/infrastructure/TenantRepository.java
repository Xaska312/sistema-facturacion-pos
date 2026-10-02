package com.poshibrido.tenancy.infrastructure;

import com.poshibrido.tenancy.domain.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    boolean existsBySlug(String slug);

    @Query("""
            select t from Tenant t
            where t.id in :ids or t.ownerUserId = :ownerId
            order by t.tradeName
            """)
    List<Tenant> findVisibleTo(@Param("ids") Collection<UUID> ids, @Param("ownerId") UUID ownerId);
}
