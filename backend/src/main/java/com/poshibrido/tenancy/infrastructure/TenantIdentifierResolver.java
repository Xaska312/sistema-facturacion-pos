package com.poshibrido.tenancy.infrastructure;

import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.domain.TenantSchemas;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.stereotype.Component;

/**
 * Devuelve el schema del tenant actual. Sin tenant en contexto devuelve {@code platform}:
 * esa conexión solo ve el schema de plataforma (donde no existen tablas de negocio), así que
 * una consulta de negocio sin tenant falla en lugar de caer en datos de otro negocio.
 * Los endpoints de negocio exigen además un token con {@code tid} (403 si no lo tiene).
 */
@Component
public class TenantIdentifierResolver implements CurrentTenantIdentifierResolver<String> {

    @Override
    public String resolveCurrentTenantIdentifier() {
        return TenantContext.current()
                .map(TenantRef::schema)
                .orElse(TenantSchemas.PLATFORM_SCHEMA);
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return true;
    }
}
