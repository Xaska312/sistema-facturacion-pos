package com.poshibrido.identity.application;

import com.poshibrido.identity.domain.User;

import java.util.UUID;

/** @param emailVerified confirmó su correo (exigido para crear un negocio) */
public record UserSummary(UUID id, String email, String fullName, boolean platformAdmin, boolean emailVerified) {

    public static UserSummary of(User user) {
        return new UserSummary(user.getId(), user.getEmail(), user.getFullName(), user.isPlatformAdmin(),
                user.isEmailVerified());
    }

    /** Con el permiso de plataforma ya resuelto ({@link PlatformAdmins}). */
    public static UserSummary of(User user, boolean platformAdmin) {
        return new UserSummary(user.getId(), user.getEmail(), user.getFullName(), platformAdmin,
                user.isEmailVerified());
    }
}
