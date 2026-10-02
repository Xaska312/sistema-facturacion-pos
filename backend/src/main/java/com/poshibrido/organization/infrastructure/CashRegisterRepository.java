package com.poshibrido.organization.infrastructure;

import com.poshibrido.organization.domain.CashRegister;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CashRegisterRepository extends JpaRepository<CashRegister, UUID> {

    boolean existsByBranchIdAndCode(UUID branchId, String code);

    Page<CashRegister> findByBranchId(UUID branchId, Pageable pageable);
}
