package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.Tax;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface TaxRepository extends JpaRepository<Tax, UUID> {

    boolean existsByCode(String code);

    Optional<Tax> findByCode(String code);
}
