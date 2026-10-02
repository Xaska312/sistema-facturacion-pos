package com.poshibrido.organization.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.organization.domain.Branch;
import com.poshibrido.organization.domain.CashRegister;
import com.poshibrido.organization.infrastructure.BranchRepository;
import com.poshibrido.organization.infrastructure.CashRegisterRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CashRegisterService {

    private final CashRegisterRepository registers;
    private final BranchRepository branches;
    private final AuditLogger audit;

    @Transactional(readOnly = true)
    public Page<CashRegister> list(UUID branchId, Pageable pageable) {
        return branchId == null ? registers.findAll(pageable) : registers.findByBranchId(branchId, pageable);
    }

    @Transactional(readOnly = true)
    public CashRegister get(UUID id) {
        return registers.findById(id).orElseThrow(() -> new NotFoundException("Caja no encontrada."));
    }

    @Transactional
    public CashRegister create(UUID branchId, String rawCode, String name) {
        Branch branch = branches.findById(branchId)
                .orElseThrow(() -> new BusinessRuleException("La sucursal indicada no existe."));
        if (!branch.isActive()) {
            throw new BusinessRuleException("No se pueden crear cajas en una sucursal inactiva.");
        }
        String code = rawCode.trim().toUpperCase(Locale.ROOT);
        if (registers.existsByBranchIdAndCode(branchId, code)) {
            throw new ConflictException("La sucursal ya tiene una caja con el código " + code + ".");
        }
        CashRegister register = registers.save(CashRegister.create(branchId, code, name.trim()));
        audit.log("CASH_REGISTER_CREATED", "cash_register", register.getId(), null,
                Map.of("branchId", branchId, "code", code, "name", register.getName()));
        return register;
    }

    @Transactional
    public CashRegister rename(UUID id, String name) {
        CashRegister register = get(id);
        String before = register.getName();
        register.rename(name.trim());
        audit.log("CASH_REGISTER_UPDATED", "cash_register", id, Map.of("name", before),
                Map.of("name", register.getName()));
        return register;
    }

    /** En Fase 5 se impedirá desactivar una caja con sesión abierta. */
    @Transactional
    public CashRegister setActive(UUID id, boolean active) {
        CashRegister register = get(id);
        if (register.isActive() != active) {
            if (active) {
                register.activate();
            } else {
                register.deactivate();
            }
            audit.log(active ? "CASH_REGISTER_ACTIVATED" : "CASH_REGISTER_DEACTIVATED", "cash_register", id,
                    null, null);
        }
        return register;
    }
}
