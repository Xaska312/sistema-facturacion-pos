package com.poshibrido.tenancy;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.access.application.OwnerMemberSeeder;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Un aprovisionamiento que falla después de crear y migrar el schema debe dejar el sistema limpio
 * (schema eliminado, sin membresía, estado FAILED) y permitir reintentar.
 */
class ProvisioningFailureIT extends IntegrationTest {

    @MockitoSpyBean
    private OwnerMemberSeeder seeder;

    @Test
    void failedProvisioningLeavesNoTraceAndCanBeRetried() throws Exception {
        Session owner = api.registerAndLogin("fail");
        String slug = TestApi.uniqueSlug("falla");
        String schema = "t_" + slug;

        doThrow(new IllegalStateException("fallo simulado"))
                .when(seeder).seedOwner(eq(schema), any(UUID.class), any(String.class));

        api.createTenantRaw(owner, slug)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("fallo simulado"))));

        UUID tenantId = jdbc.queryForObject("SELECT id FROM platform.tenants WHERE slug = ?", UUID.class, slug);
        assertThat(jdbc.queryForObject("SELECT status FROM platform.tenants WHERE id = ?", String.class, tenantId))
                .isEqualTo("FAILED");
        assertThat(schemaExists(schema)).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM platform.memberships WHERE tenant_id = ?",
                Integer.class, tenantId)).isZero();
        api.selectTenantRaw(owner, tenantId).andExpect(status().isForbidden());

        // Reintento idempotente, ahora sin fallo
        doCallRealMethod().when(seeder).seedOwner(any(String.class), any(UUID.class), any(String.class));
        String body = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/tenants/{id}/retry-provisioning", tenantId)
                        .header("Authorization", owner.bearer()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(body, "$.status")).isEqualTo("ACTIVE");
        assertThat(schemaExists(schema)).isTrue();

        Session relogged = api.login(jdbc.queryForObject(
                "SELECT u.email FROM platform.users u JOIN platform.tenants t ON t.owner_user_id = u.id WHERE t.id = ?",
                String.class, tenantId));
        api.selectTenant(relogged, tenantId);
    }

    @Test
    void onlyOwnerCanRetryAndOnlyFailedTenants() throws Exception {
        Session owner = api.registerAndLogin("retry-owner");
        UUID active = api.createTenant(owner, TestApi.uniqueSlug("activo"));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/tenants/{id}/retry-provisioning", active)
                        .header("Authorization", owner.bearer()))
                .andExpect(status().isConflict());

        Session other = api.registerAndLogin("retry-other");
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/tenants/{id}/retry-provisioning", active)
                        .header("Authorization", other.bearer()))
                .andExpect(status().isNotFound());
    }

    private boolean schemaExists(String schema) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM information_schema.schemata WHERE schema_name = ?", Integer.class, schema);
        return count != null && count > 0;
    }
}
