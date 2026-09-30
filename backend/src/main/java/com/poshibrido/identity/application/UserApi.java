package com.poshibrido.identity.application;

import java.util.UUID;

public interface UserApi {

    /** Usuario activo o excepción (404 si no existe, 403 si no está activo). */
    UserSummary requireActive(UUID userId);
}
