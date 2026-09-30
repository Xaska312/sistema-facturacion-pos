package com.poshibrido.tenancy.infrastructure;

import com.poshibrido.tenancy.domain.TenantSchemas;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.util.List;

/**
 * Al arrancar: migra {@code platform}, luego la plantilla de tenant y luego todos los negocios
 * en estado ACTIVE. El EntityManagerFactory depende de este bean ({@link MigrationOrderConfig}),
 * por lo que Hibernate valida el modelo sobre un schema ya migrado.
 */
@Slf4j
@RequiredArgsConstructor
@Component(DatabaseMigrator.BEAN_NAME)
public class DatabaseMigrator implements InitializingBean {

    public static final String BEAN_NAME = "databaseMigrator";

    private final DataSource dataSource;
    private final TenantSchemaMigrator migrator;

    @Override
    public void afterPropertiesSet() {
        migrator.migratePlatform();
        migrator.migrateTenant(TenantSchemas.TEMPLATE_SCHEMA);

        List<String> schemas = new JdbcTemplate(dataSource).queryForList(
                "SELECT schema_name FROM platform.tenants WHERE status = 'ACTIVE' ORDER BY created_at",
                String.class);
        for (String schema : schemas) {
            migrator.migrateTenant(TenantSchemas.requireTenantSchema(schema));
        }
        log.info("Migración de {} negocios activos completada", schemas.size());
    }
}
