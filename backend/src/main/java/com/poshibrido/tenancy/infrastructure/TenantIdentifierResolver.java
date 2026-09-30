package com.poshibrido.tenancy.infrastructure;

import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.stereotype.Component;

@Component
public class TenantIdentifierResolver implements CurrentTenantIdentifierResolver<String> {
    
    @Override
    public String resolveCurrentTenantIdentifier() {
        String tenantId = TenantContext.getTenantId();
        // Si no hay tenant en contexto, obligamos a enrutar a platform.
        // Los endpoints protegidos de tenant validarán antes de llegar aquí.
        return tenantId != null ? tenantId : "platform";
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return true;
    }
}