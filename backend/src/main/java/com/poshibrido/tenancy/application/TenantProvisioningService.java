package com.poshibrido.tenancy.application;

import lombok.RequiredArgsConstructor;
import org.flywaydb.core.Flyway;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class TenantProvisioningService {

    private final DataSource dataSource;
    // Validación estricta del slug (Regla 2.3)
    private static final Pattern SLUG_PATTERN = Pattern.compile("^[a-z][a-z0-9_]{2,40}$");

    public void provisionTenantSchema(String slug) {
        if (!SLUG_PATTERN.matcher(slug).matches()) {
            throw new IllegalArgumentException("Slug de tenant inválido");
        }

        String schemaName = "t_" + slug;

        // 1. Crear el esquema
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute("CREATE SCHEMA IF NOT EXISTS " + schemaName);
        } catch (Exception e) {
            throw new RuntimeException("Error creando schema para el tenant: " + schemaName, e);
        }

        // 2. Ejecutar Flyway específicamente para este tenant
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .schemas(schemaName)
                .locations("classpath:db/tenant")
                .load();
        flyway.migrate();
    }
}
