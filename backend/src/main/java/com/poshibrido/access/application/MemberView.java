package com.poshibrido.access.application;

import java.util.List;
import java.util.UUID;

/** Miembro con datos enriquecidos (correo de plataforma, nombres de roles y sucursales). */
public record MemberView(UUID id, String displayName, String email, boolean active, boolean owner,
                         List<RoleRef> roles, List<BranchRefView> branches, UUID defaultBranchId) {

    public record RoleRef(UUID id, String code, String name) {
    }

    public record BranchRefView(UUID id, String code, String name) {
    }
}
