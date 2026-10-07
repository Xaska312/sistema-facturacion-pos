package com.poshibrido.identity.infrastructure;

import com.poshibrido.identity.domain.RefreshToken;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    /** Con bloqueo de fila: dos renovaciones simultáneas del mismo token se atienden una después de la otra. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from RefreshToken r where r.tokenHash = :tokenHash")
    Optional<RefreshToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    @Modifying
    @Query("update RefreshToken r set r.revokedAt = :now where r.userId = :userId and r.revokedAt is null")
    int revokeAllActive(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Query("""
            update RefreshToken r set r.revokedAt = :now
            where r.userId = :userId and r.tenantId = :tenantId and r.revokedAt is null
            """)
    int revokeActiveForTenant(@Param("userId") UUID userId, @Param("tenantId") UUID tenantId,
                              @Param("now") Instant now);

    @Modifying
    @Query("update RefreshToken r set r.revokedAt = :now where r.tenantId = :tenantId and r.revokedAt is null")
    int revokeAllActiveForTenant(@Param("tenantId") UUID tenantId, @Param("now") Instant now);
}
