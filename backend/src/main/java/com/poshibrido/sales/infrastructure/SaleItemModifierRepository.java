package com.poshibrido.sales.infrastructure;

import com.poshibrido.sales.domain.SaleItemModifier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface SaleItemModifierRepository extends JpaRepository<SaleItemModifier, UUID> {

    List<SaleItemModifier> findBySaleItemIdInOrderByPositionAsc(Collection<UUID> saleItemIds);
}
