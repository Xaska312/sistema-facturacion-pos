package com.poshibrido.organization.api;

import com.poshibrido.organization.domain.Branch;

import java.util.UUID;

public record BranchResponse(UUID id, String code, String name, String address, String cityCode, String phone,
                             boolean active) {

    public static BranchResponse of(Branch branch) {
        return new BranchResponse(branch.getId(), branch.getCode(), branch.getName(), branch.getAddress(),
                branch.getCityCode(), branch.getPhone(), branch.isActive());
    }
}
