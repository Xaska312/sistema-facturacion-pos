package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.PriceList;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PriceListRepository extends JpaRepository<PriceList, UUID> {

    boolean existsByCode(String code);

    Optional<PriceList> findByDefaultListTrue();
}
