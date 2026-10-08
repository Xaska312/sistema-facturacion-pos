package com.poshibrido.tenancy;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.tenancy.application.TenantDirectory;
import com.poshibrido.tenancy.infrastructure.DatabaseMigrator;
import com.poshibrido.tenancy.infrastructure.TenantMigrationFailures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * QA INV-1 / INV-4: un negocio que no se puede migrar al arrancar queda sin servicio, pero el arranque sigue y los
 * demás negocios funcionan; un schema que falta no se recrea vacío.
 */
class TenantMigrationFailureIT extends IntegrationTest {

    @Autowired
    private DatabaseMigrator migrator;

    @Autowired
    private TenantMigrationFailures failures;

    @Autowired
    private TenantDirectory directory;

    @Test
    void aTenantThatFailsToMigrateIsIsolatedAndTheRestKeepWorking() throws Exception {
        Owned broken = api.newTenant("migra-mal");
        Owned healthy = api.newTenant("migra-bien");
        String schema = schemaOf(broken);
        // Simula un negocio con datos que chocan con una migración: Flyway rechaza la suma de verificación alterada.
        jdbc.update("UPDATE " + schema + ".flyway_schema_history SET checksum = checksum + 1 WHERE version = '1'");
        try {
            migrator.afterPropertiesSet(); // como al arrancar: no lanza
            assertThat(failures.isFailed(schema)).isTrue();
            directory.evict(broken.tenantId());
            api.getWith(broken.tenant(), "/api/v1/branches").andExpect(status().isForbidden());
            api.getWith(healthy.tenant(), "/api/v1/branches").andExpect(status().isOk());
        } finally {
            jdbc.update("UPDATE " + schema + ".flyway_schema_history SET checksum = checksum - 1 WHERE version = '1'");
        }
        migrator.afterPropertiesSet();
        assertThat(failures.isFailed(schema)).isFalse();
        directory.evict(broken.tenantId());
        api.selectTenantRaw(api.login(broken.email()), broken.tenantId()).andExpect(status().isOk());
    }

    @Test
    void aMissingTenantSchemaIsNotRecreatedEmpty() throws Exception {
        Owned owner = api.newTenant("sin-schema");
        String schema = schemaOf(owner);
        jdbc.execute("DROP SCHEMA " + schema + " CASCADE");
        try {
            migrator.afterPropertiesSet();
            Integer exists = jdbc.queryForObject(
                    "SELECT count(*) FROM information_schema.schemata WHERE schema_name = ?", Integer.class, schema);
            assertThat(exists).isZero();
            assertThat(failures.isFailed(schema)).isTrue();
        } finally {
            // Fuera de servicio para siempre en la base de pruebas: que no lo vuelvan a intentar otros arranques.
            jdbc.update("UPDATE platform.tenants SET status = 'FAILED' WHERE id = ?", owner.tenantId());
            failures.markOk(schema);
        }
    }

    private String schemaOf(Owned owner) {
        return jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
    }
}
