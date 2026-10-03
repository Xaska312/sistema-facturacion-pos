package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {

    @Query("select p from Product p where upper(p.sku) = upper(:sku)")
    Optional<Product> findBySkuIgnoreCase(@Param("sku") String sku);

    @Query("select p from Product p where upper(p.sku) in :skus")
    List<Product> findBySkusUpper(@Param("skus") Collection<String> skusUpper);

    /**
     * Búsqueda por nombre, SKU o código de barras exacto. Los filtros opcionales se activan con
     * banderas para no enviar parámetros nulos (PostgreSQL no puede inferir su tipo).
     */
    @Query("""
            select p from Product p
            where (lower(p.name) like :pattern escape '\\'
                   or upper(p.sku) like :patternUpper escape '\\'
                   or p.id in (select b.product.id from ProductBarcode b where b.barcode = :exact))
              and (:anyCategory = true or p.categoryId = :categoryId)
              and (:includeInactive = true or p.active = true)
            """)
    Page<Product> search(@Param("pattern") String pattern, @Param("patternUpper") String patternUpper,
                         @Param("exact") String exact, @Param("anyCategory") boolean anyCategory,
                         @Param("categoryId") UUID categoryId, @Param("includeInactive") boolean includeInactive,
                         Pageable pageable);

    @Query("select count(p) from Product p where p.active = true and (p.baseUnitId = :unitId "
            + "or exists (select 1 from ProductUnitConversion c where c.product = p and c.unitId = :unitId))")
    long countActiveUsingUnit(@Param("unitId") UUID unitId);

    long countByTaxIdAndActiveTrue(UUID taxId);

    /**
     * Bloquea las filas de productos en orden de id. {@code FOR NO KEY UPDATE} (y no {@code FOR UPDATE}) para no
     * chocar con los {@code FOR KEY SHARE} que PostgreSQL toma al validar las llaves foráneas de los movimientos.
     */
    @Query(value = "SELECT id FROM products WHERE id IN (:ids) ORDER BY id FOR NO KEY UPDATE", nativeQuery = true)
    List<UUID> lockIds(@Param("ids") Collection<UUID> ids);

    /** Productos cuyo costo aún no maneja el inventario ({@code cost_locked} nunca vuelve a falso). */
    @Query("select p.id from Product p where p.id in :ids and p.costLocked = false")
    List<UUID> findIdsWithUnlockedCost(@Param("ids") Collection<UUID> ids);

    /** Productos activos que controlan inventario (listado de existencias). */
    @Query("""
            select p from Product p
            where p.active = true and p.trackInventory = true
              and (lower(p.name) like :pattern escape '\\'
                   or upper(p.sku) like :patternUpper escape '\\'
                   or p.id in (select b.product.id from ProductBarcode b where b.barcode = :exact))
              and (:anyCategory = true or p.categoryId = :categoryId)
            """)
    Page<Product> searchTracked(@Param("pattern") String pattern, @Param("patternUpper") String patternUpper,
                                @Param("exact") String exact, @Param("anyCategory") boolean anyCategory,
                                @Param("categoryId") UUID categoryId, Pageable pageable);

    long countByCategoryIdAndActiveTrue(UUID categoryId);
}
