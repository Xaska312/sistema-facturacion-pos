package com.poshibrido.organization.application;

import com.poshibrido.organization.domain.Branch;
import com.poshibrido.organization.infrastructure.BranchRepository;
import com.poshibrido.shared.error.ConflictException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
@RequiredArgsConstructor
public class BranchService {

    private final BranchRepository branches;

    @Transactional(readOnly = true)
    public Page<Branch> list(Pageable pageable) {
        return branches.findAll(pageable);
    }

    @Transactional
    public Branch create(CreateBranchCommand command) {
        String code = command.code().trim().toUpperCase(Locale.ROOT);
        if (branches.existsByCode(code)) {
            throw new ConflictException("Ya existe una sucursal con el código " + code + ".");
        }
        return branches.save(Branch.create(code, command.name().trim(), blankToNull(command.address()),
                blankToNull(command.cityCode()), blankToNull(command.phone())));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record CreateBranchCommand(String code, String name, String address, String cityCode, String phone) {
    }
}
