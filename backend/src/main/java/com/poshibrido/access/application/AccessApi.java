package com.poshibrido.access.application;

import java.util.List;
import java.util.UUID;

/**
 * Consultas de acceso dentro del schema de un negocio. Se usan al emitir tokens de negocio,
 * momento en que la petición todavía no tiene tenant en contexto.
 */
public interface AccessApi {

    boolean isMemberActive(String tenantSchema, UUID memberId);

    List<String> permissionsOf(String tenantSchema, UUID memberId);
}
