package com.poshibrido.tenancy.application;

import java.util.UUID;

/**
 * Referencia mínima a un negocio activo: suficiente para enrutar la conexión.
 */
public record TenantRef(UUID id, String slug, String schema) {
}
