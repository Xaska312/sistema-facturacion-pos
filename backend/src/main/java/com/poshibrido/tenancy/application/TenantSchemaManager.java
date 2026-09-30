package com.poshibrido.tenancy.application;

import com.poshibrido.tenancy.domain.TenantSchemas;
import com.poshibrido.tenancy.infrastructure.TenantSchemaMigrator;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * DDL de schemas de negocio. Todos los nombres se validan antes de llegar al SQL.
 */
@Component
@RequiredArgsConstructor
public class TenantSchemaManager {

    private final DataSource dataSource;
    private final TenantSchemaMigrator migrator;

    public void createAndMigrate(String schema) {
        String safe = TenantSchemas.requireTenantSchema(schema);
        new JdbcTemplate(dataSource).execute("CREATE SCHEMA " + safe);
        migrator.migrateTenant(safe);
    }

    public void drop(String schema) {
        String safe = TenantSchemas.requireTenantSchema(schema);
        new JdbcTemplate(dataSource).execute("DROP SCHEMA IF EXISTS " + safe + " CASCADE");
    }

    public boolean exists(String schema) {
        String safe = TenantSchemas.requireTenantSchema(schema);
        Integer count = new JdbcTemplate(dataSource).queryForObject(
                "SELECT count(*) FROM information_schema.schemata WHERE schema_name = ?", Integer.class, safe);
        return count != null && count > 0;
    }
}
