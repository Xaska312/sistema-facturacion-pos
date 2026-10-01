package com.poshibrido.organization.infrastructure;

import com.poshibrido.organization.domain.Branch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface BranchRepository extends JpaRepository<Branch, UUID> {

    boolean existsByCode(String code);

    long countByActiveTrue();
}
