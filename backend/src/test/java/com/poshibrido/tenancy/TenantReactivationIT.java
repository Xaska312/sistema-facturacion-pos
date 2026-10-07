package com.poshibrido.tenancy;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import com.poshibrido.tenancy.infrastructure.TenantSchemaMigrator;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Un negocio suspendido durante una actualización (p. ej. por falta de pago) no debe volver con su schema
 * atrasado: al reactivarlo se aplican las migraciones pendientes antes de abrirlo.
 */
class TenantReactivationIT extends IntegrationTest {

    @MockitoSpyBean
    private TenantSchemaMigrator migrator;

    @Test
    void reactivatingMigratesTheTenantSchemaFirst() throws Exception {
        Owned owner = api.newTenant("reactivar");
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        Session admin = platformAdmin();
        String base = "/api/v1/platform/tenants/" + owner.tenantId();

        api.postWith(admin, base + "/suspend", "{\"reason\":\"Pago pendiente\"}").andExpect(status().isOk());
        clearInvocations(migrator);
        api.postWith(admin, base + "/reactivate", "{}").andExpect(status().isOk());

        verify(migrator).migrateTenant(schema);
        api.getWith(api.selectTenant(api.login(owner.email()), owner.tenantId()), "/api/v1/branches")
                .andExpect(status().isOk());
    }
}
