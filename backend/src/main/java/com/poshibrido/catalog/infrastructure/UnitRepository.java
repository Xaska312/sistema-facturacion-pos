package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.Unit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UnitRepository extends JpaRepository<Unit, UUID> {

    boolean existsByCode(String code);

    Optional<Unit> findByCode(String code);
}
