package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.ProductModel;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface ProductModelRepository extends JpaRepository<ProductModel, UUID> {

    @Query("select m from ProductModel m where upper(m.skuPrefix) = upper(:prefix)")
    Optional<ProductModel> findBySkuPrefixIgnoreCase(@Param("prefix") String prefix);

    @Query("""
            select m from ProductModel m
            where (lower(m.name) like :pattern escape '\\' or upper(m.skuPrefix) like :patternUpper escape '\\')
              and (:includeInactive = true or m.active = true)
            """)
    Page<ProductModel> search(@Param("pattern") String pattern, @Param("patternUpper") String patternUpper,
                              @Param("includeInactive") boolean includeInactive, Pageable pageable);

    long countBySizeScaleId(UUID sizeScaleId);
}
