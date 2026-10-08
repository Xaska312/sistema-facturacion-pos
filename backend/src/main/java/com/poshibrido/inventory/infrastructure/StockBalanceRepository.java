package com.poshibrido.inventory.infrastructure;

import com.poshibrido.inventory.domain.StockBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StockBalanceRepository extends JpaRepository<StockBalance, UUID> {

    /** Crea el saldo en cero si no existe (sin lote). Seguro ante concurrencia. */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO stock_balances (id, branch_id, product_id, quantity, updated_at, version)
            VALUES (:id, :branchId, :productId, 0, now(), 0)
            ON CONFLICT (branch_id, product_id) WHERE lot_id IS NULL DO NOTHING
            """, nativeQuery = true)
    int ensureExists(@Param("id") UUID id, @Param("branchId") UUID branchId, @Param("productId") UUID productId);

    /**
     * Bloquea (SELECT … FOR UPDATE) los saldos de esos productos en esas sucursales, siempre en el mismo
     * orden (producto, sucursal) para evitar interbloqueos entre operaciones concurrentes.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select b from StockBalance b
            where b.lotId is null and b.productId in :productIds and b.branchId in :branchIds
            order by b.productId, b.branchId
            """)
    List<StockBalance> lockAll(@Param("productIds") Collection<UUID> productIds,
                               @Param("branchIds") Collection<UUID> branchIds);

    @Query("select b from StockBalance b where b.lotId is null and b.branchId = :branchId and b.productId = :productId")
    Optional<StockBalance> find(@Param("branchId") UUID branchId, @Param("productId") UUID productId);

    @Query("select b from StockBalance b where b.lotId is null and b.branchId = :branchId and b.productId in :productIds")
    List<StockBalance> findForBranch(@Param("branchId") UUID branchId, @Param("productIds") Collection<UUID> productIds);

    /** Si el producto tiene saldo distinto de cero en alguna sucursal. */
    @Query("select count(b) > 0 from StockBalance b where b.productId = :productId and b.quantity <> 0")
    boolean existsNonZero(@Param("productId") UUID productId);

    /** Existencia total del producto en todas las sucursales (para el costo promedio). */
    @Query("select coalesce(sum(b.quantity), 0) from StockBalance b where b.productId = :productId")
    BigDecimal totalQuantity(@Param("productId") UUID productId);

    /** Saldos en o por debajo del mínimo configurado (alertas). Todas las sucursales si anyBranch. */
    @Query("""
            select b from StockBalance b
            where b.lotId is null and b.minStock is not null and b.quantity <= b.minStock
              and (:anyBranch = true or b.branchId = :branchId)
            order by b.branchId, b.productId
            """)
    List<StockBalance> belowMinimum(@Param("anyBranch") boolean anyBranch, @Param("branchId") UUID branchId);
}
