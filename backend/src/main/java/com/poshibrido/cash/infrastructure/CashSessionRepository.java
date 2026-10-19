package com.poshibrido.cash.infrastructure;

import com.poshibrido.cash.domain.CashSession;
import com.poshibrido.cash.domain.CashSessionStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CashSessionRepository extends JpaRepository<CashSession, UUID> {

    Optional<CashSession> findByOpenedByAndStatus(UUID openedBy, CashSessionStatus status);

    List<CashSession> findByStatus(CashSessionStatus status);

    /**
     * Sesión abierta donde vende el usuario: la suya o la compartida a la que se unió (la suya primero). Si la caja
     * dejó de ser compartida, quienes se unieron ya no venden en ella.
     */
    String CURRENT_OF = """
            SELECT s.id FROM cash_sessions s
            WHERE s.status = 'OPEN'
              AND (s.opened_by = :userId
                   OR (EXISTS (SELECT 1 FROM cash_session_users u
                               WHERE u.cash_session_id = s.id AND u.member_id = :userId)
                       AND EXISTS (SELECT 1 FROM cash_registers r WHERE r.id = s.cash_register_id AND r.shared)))
            ORDER BY (s.opened_by = :userId) DESC, s.opened_at DESC
            LIMIT 1
            """;

    @Query(value = CURRENT_OF, nativeQuery = true)
    List<UUID> currentOf(@Param("userId") UUID userId);

    /**
     * Bloqueo compartido de la sesión abierta del usuario (la suya o la compartida a la que se unió, decisión
     * 256): las ventas y anulaciones lo toman para que el cierre (que bloquea en exclusiva) espere a que terminen.
     * Si el cierre gana, la fila ya no cumple {@code status = 'OPEN'} y no se devuelve nada.
     */
    @Query(value = CURRENT_OF + " FOR SHARE OF s", nativeQuery = true)
    List<UUID> lockOpenOf(@Param("userId") UUID userId);

    /** El usuario vende en esta sesión compartida. */
    @Query(value = "SELECT EXISTS (SELECT 1 FROM cash_session_users WHERE cash_session_id = :sessionId"
            + " AND member_id = :userId)", nativeQuery = true)
    boolean isMember(@Param("sessionId") UUID sessionId, @Param("userId") UUID userId);

    @Modifying
    @Query(value = "INSERT INTO cash_session_users (cash_session_id, member_id, joined_at)"
            + " VALUES (:sessionId, :userId, now()) ON CONFLICT DO NOTHING", nativeQuery = true)
    int join(@Param("sessionId") UUID sessionId, @Param("userId") UUID userId);

    /** Deja las sesiones abiertas a las que se había unido (las cerradas conservan quién vendió en ellas). */
    @Modifying
    @Query(value = "DELETE FROM cash_session_users u USING cash_sessions s"
            + " WHERE u.cash_session_id = s.id AND s.status = 'OPEN' AND u.member_id = :userId", nativeQuery = true)
    int leaveOpen(@Param("userId") UUID userId);

    /** Igual que {@link #lockOpenOf}, para una sesión concreta. */
    @Query(value = "SELECT id FROM cash_sessions WHERE id = :id AND status = 'OPEN' FOR SHARE", nativeQuery = true)
    List<UUID> lockIfOpen(@Param("id") UUID id);

    /** Bloqueo exclusivo para cerrar la sesión. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from CashSession s where s.id = :id")
    Optional<CashSession> lockForClose(@Param("id") UUID id);

    @Query("""
            select s from CashSession s
            where (:anyRegister = true or s.cashRegisterId = :registerId)
              and (:anyBranch = true or s.branchId = :branchId)
              and (:anyStatus = true or s.status = :status)
              and (:anyUser = true or s.openedBy = :userId)
              and s.openedAt >= :from and s.openedAt < :to
            order by s.openedAt desc
            """)
    Page<CashSession> search(@Param("anyRegister") boolean anyRegister, @Param("registerId") UUID registerId,
                             @Param("anyBranch") boolean anyBranch, @Param("branchId") UUID branchId,
                             @Param("anyStatus") boolean anyStatus, @Param("status") CashSessionStatus status,
                             @Param("anyUser") boolean anyUser, @Param("userId") UUID userId,
                             @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);
}
