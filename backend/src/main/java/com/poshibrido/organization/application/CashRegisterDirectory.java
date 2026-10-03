package com.poshibrido.organization.application;

import com.poshibrido.organization.domain.Branch;
import com.poshibrido.organization.domain.CashRegister;
import com.poshibrido.organization.infrastructure.BranchRepository;
import com.poshibrido.organization.infrastructure.CashRegisterRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CashRegisterDirectory implements CashRegisterApi {

    private final CashRegisterRepository registers;
    private final BranchRepository branches;

    @Override
    @Transactional(readOnly = true)
    public Optional<RegisterRef> find(UUID id) {
        return registers.findById(id).flatMap(r -> branches.findById(r.getBranchId()).map(b -> toRef(r, b)));
    }

    @Override
    @Transactional(readOnly = true)
    public List<RegisterRef> all() {
        Map<UUID, Branch> byId = branches.findAll().stream().collect(Collectors.toMap(Branch::getId, Function.identity()));
        return registers.findAll().stream()
                .filter(r -> byId.containsKey(r.getBranchId()))
                .map(r -> toRef(r, byId.get(r.getBranchId())))
                .sorted(Comparator.comparing(RegisterRef::branchCode).thenComparing(RegisterRef::code))
                .toList();
    }

    private static RegisterRef toRef(CashRegister r, Branch b) {
        return new RegisterRef(r.getId(), r.getCode(), r.getName(), r.isActive(), b.getId(), b.getCode(), b.getName(),
                b.isActive());
    }
}
