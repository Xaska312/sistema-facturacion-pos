package com.poshibrido.tenancy.infrastructure;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * Ejecuta Flyway: {@code db/platform} sobre el schema {@code platform} y {@code db/tenant}
 * sobre cada schema de negocio (y la plantilla).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TenantSchemaMigrator {

    private final DataSource dataSource;

    public void migratePlatform() {
        migrate("platform", "classpath:db/platform");
    }

    /** El nombre del schema debe venir validado por {@code TenantSchemas}. */
    public void migrateTenant(String schema) {
        migrate(schema, "classpath:db/tenant");
    }

    private void migrate(String schema, String location) {
        var result = Flyway.configure()
                .dataSource(dataSource)
                .schemas(schema)
                .defaultSchema(schema)
                .createSchemas(true)
                .locations(location)
                .load()
                .migrate();
        log.info("Flyway {} -> {}: {} migraciones aplicadas", location, schema, result.migrationsExecuted);
    }
}
