package com.poshibrido.identity.application;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface UserApi {

    /** Usuario activo o excepción (404 si no existe, 403 si no está activo). */
    UserSummary requireActive(UUID userId);

    /** Resúmenes de los usuarios indicados (los inexistentes se omiten). */
    Map<UUID, UserSummary> findSummaries(Collection<UUID> userIds);

    Optional<UserSummary> findByEmail(String email);

    /** La contraseña coincide con la del usuario (para confirmar acciones delicadas, p. ej. cerrar un negocio). */
    boolean passwordMatches(UUID userId, String rawPassword);

    /**
     * Da por confirmado el correo (p. ej. al aceptar una invitación que llegó a ese correo). Dentro de una
     * transacción.
     */
    void markEmailVerified(UUID userId);
}
