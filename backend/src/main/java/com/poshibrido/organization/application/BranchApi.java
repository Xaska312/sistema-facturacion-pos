package com.poshibrido.organization.application;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Sucursales del negocio actual para otros módulos. */
public interface BranchApi {

    record BranchRef(UUID id, String code, String name, boolean active, String address, String phone) {
    }

    List<BranchRef> findByIds(Collection<UUID> ids);
}
