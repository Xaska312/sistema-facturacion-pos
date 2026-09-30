package com.poshibrido.tenancy.application;

import java.util.UUID;

/**
 * Siembra los datos que dependen del dueño (miembro + rol OWNER) en el schema recién migrado.
 * Los datos base comunes (roles, permisos, sucursal, caja, ajustes) los siembra Flyway.
 */
public interface TenantDataSeeder {

    void seedOwner(String schema, UUID ownerUserId, String ownerDisplayName);
}
