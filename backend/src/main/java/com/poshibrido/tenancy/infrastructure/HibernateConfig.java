package com.poshibrido.tenancy.infrastructure;

import org.hibernate.cfg.AvailableSettings;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Multi-tenancy por schema con un único EntityManagerFactory y un único TransactionManager.
 */
@Configuration(proxyBeanMethods = false)
public class HibernateConfig {

    @Bean
    public HibernatePropertiesCustomizer multiTenancyCustomizer(TenantConnectionProvider connectionProvider,
                                                                TenantIdentifierResolver tenantResolver) {
        return properties -> {
            properties.put(AvailableSettings.MULTI_TENANT_CONNECTION_PROVIDER, connectionProvider);
            properties.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, tenantResolver);
        };
    }
}
