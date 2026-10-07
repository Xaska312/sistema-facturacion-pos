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

    /**
     * La contraseña coincide con la del usuario (para confirmar acciones delicadas, p. ej. cerrar un negocio). Si no,
     * cuenta como intento fallido; con la cuenta bloqueada lanza {@code AccountLockedException}. Dentro de una
     * transacción que no se revierta con el error, para que el intento quede guardado.
     */
    boolean passwordMatches(UUID userId, String rawPassword);
}
