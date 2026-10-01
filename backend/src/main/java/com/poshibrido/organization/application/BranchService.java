package com.poshibrido.organization.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.location.application.LocationApi;
import com.poshibrido.organization.domain.Branch;
import com.poshibrido.organization.infrastructure.BranchRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class BranchService implements BranchApi {

    private final BranchRepository branches;
    private final LocationApi locations;
    private final AuditLogger audit;

    public record BranchData(String name, String address, String cityCode, String phone) {
    }

    @Transactional(readOnly = true)
    public Page<Branch> list(Pageable pageable) {
        return branches.findAll(pageable);
    }

    @Transactional(readOnly = true)
    public Branch get(UUID id) {
        return branches.findById(id).orElseThrow(() -> new NotFoundException("Sucursal no encontrada."));
    }

    @Transactional
    public Branch create(String rawCode, BranchData data) {
        String code = rawCode.trim().toUpperCase(Locale.ROOT);
        if (branches.existsByCode(code)) {
            throw new ConflictException("Ya existe una sucursal con el código " + code + ".");
        }
        String cityCode = validCity(data.cityCode());
        Branch branch = branches.save(Branch.create(code, data.name().trim(), blankToNull(data.address()),
                cityCode, blankToNull(data.phone())));
        audit.log("BRANCH_CREATED", "branch", branch.getId(), null, snapshot(branch));
        return branch;
    }

    @Transactional
    public Branch update(UUID id, BranchData data) {
        Branch branch = get(id);
        Map<String, Object> before = snapshot(branch);
        branch.update(data.name().trim(), blankToNull(data.address()), validCity(data.cityCode()),
                blankToNull(data.phone()));
        audit.log("BRANCH_UPDATED", "branch", id, before, snapshot(branch));
        return branch;
    }

    @Transactional
    public Branch deactivate(UUID id) {
        Branch branch = get(id);
        if (!branch.isActive()) {
            return branch;
        }
        if (branches.countByActiveTrue() <= 1) {
            throw new BusinessRuleException("El negocio debe tener al menos una sucursal activa.");
        }
        branch.deactivate();
        audit.log("BRANCH_DEACTIVATED", "branch", id, null, null);
        return branch;
    }

    @Transactional
    public Branch activate(UUID id) {
        Branch branch = get(id);
        if (!branch.isActive()) {
            branch.activate();
            audit.log("BRANCH_ACTIVATED", "branch", id, null, null);
        }
        return branch;
    }

    @Override
    @Transactional(readOnly = true)
    public List<BranchRef> findByIds(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return branches.findAllById(ids).stream()
                .map(b -> new BranchRef(b.getId(), b.getCode(), b.getName(), b.isActive()))
                .toList();
    }

    private String validCity(String cityCode) {
        String code = blankToNull(cityCode);
        if (code != null && locations.findCity(code).isEmpty()) {
            throw new BusinessRuleException("El municipio " + code + " no existe en el catálogo DIVIPOLA.");
        }
        return code;
    }

    private static Map<String, Object> snapshot(Branch branch) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("code", branch.getCode());
        data.put("name", branch.getName());
        data.put("address", branch.getAddress());
        data.put("cityCode", branch.getCityCode());
        data.put("phone", branch.getPhone());
        data.put("active", branch.isActive());
        return data;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
