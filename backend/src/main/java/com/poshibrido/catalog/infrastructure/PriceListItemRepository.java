package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.PriceListItem;
import com.poshibrido.catalog.domain.PriceListItemId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface PriceListItemRepository extends JpaRepository<PriceListItem, PriceListItemId> {

    @Query("select i from PriceListItem i where i.id.productId = :productId")
    List<PriceListItem> findByProduct(@Param("productId") UUID productId);
}
