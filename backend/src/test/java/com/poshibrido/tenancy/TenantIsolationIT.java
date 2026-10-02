package com.poshibrido.tenancy;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Aislamiento entre negocios: el tenant solo proviene del claim tid del JWT.
 */
class TenantIsolationIT extends IntegrationTest {

    @Test
    void provisioningCreatesSchemaWithSeedsAndOwnerMembership() throws Exception {
        Session owner = api.registerAndLogin("owner");
        String slug = TestApi.uniqueSlug("tienda");
        UUID tenantId = api.createTenant(owner, slug);

        assertThat(jdbc.queryForObject("SELECT status FROM platform.tenants WHERE id = ?", String.class, tenantId))
                .isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM information_schema.schemata WHERE schema_name = ?", Integer.class, "t_" + slug))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM t_" + slug + ".roles", Integer.class)).isEqualTo(6);

        Session tenantSession = api.selectTenant(owner, tenantId);
        api.getWith(tenantSession, "/api/v1/auth/me")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(tenantId.toString()))
                .andExpect(jsonPath("$.permissions", hasItem("branches:manage")));

        String tenantsBody = api.getWith(owner, "/api/v1/tenants")
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> statuses = JsonPath.read(tenantsBody, "$[?(@.id == '%s')].status".formatted(tenantId));
        assertThat(statuses).as("GET /tenants respondió: %s", tenantsBody).containsExactly("ACTIVE");
    }

    @Test
    void duplicateSlugIsConflict() throws Exception {
        Session owner = api.registerAndLogin("dupslug");
        String slug = TestApi.uniqueSlug("dup");
        api.createTenant(owner, slug);
        api.createTenantRaw(owner, slug).andExpect(status().isConflict());
    }

    @Test
    void invalidSlugIsRejectedBeforeReachingSql() throws Exception {
        Session owner = api.registerAndLogin("badslug");
        api.createTenantRaw(owner, "x; DROP SCHEMA platform CASCADE").andExpect(status().isBadRequest());
        api.createTenantRaw(owner, "Mayus").andExpect(status().isBadRequest());
    }

    @Test
    void platformTokenWithoutTenantGetsForbiddenOnBusinessEndpoints() throws Exception {
        Session platform = api.registerAndLogin("notid");
        api.getWith(platform, "/api/v1/branches").andExpect(status().isForbidden());
        api.postWith(platform, "/api/v1/branches", """
                {"code":"X1","name":"No debería crearse"}
                """).andExpect(status().isForbidden());
    }

    @Test
    void cannotSelectTenantWithoutMembership() throws Exception {
        Session ownerA = api.registerAndLogin("a");
        UUID tenantA = api.createTenant(ownerA, TestApi.uniqueSlug("a"));

        Session intruder = api.registerAndLogin("intruso");
        api.selectTenantRaw(intruder, tenantA).andExpect(status().isForbidden());
        // Negocio inexistente: misma respuesta (no revela existencia)
        api.selectTenantRaw(intruder, UUID.randomUUID()).andExpect(status().isForbidden());
    }

    @Test
    void dataOfTenantANeverVisibleOrWritableFromTenantB() throws Exception {
        Session ownerA = api.registerAndLogin("iso-a");
        String slugA = TestApi.uniqueSlug("isoa");
        UUID tenantA = api.createTenant(ownerA, slugA);
        Session sessionA = api.selectTenant(ownerA, tenantA);

        Session ownerB = api.registerAndLogin("iso-b");
        String slugB = TestApi.uniqueSlug("isob");
        UUID tenantB = api.createTenant(ownerB, slugB);
        Session sessionB = api.selectTenant(ownerB, tenantB);

        api.postWith(sessionA, "/api/v1/branches", """
                {"code":"SECRETA","name":"Sucursal secreta de A"}
                """).andExpect(status().isCreated());

        // B no ve la sucursal de A
        api.getWith(sessionB, "/api/v1/branches")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[*].code", not(hasItem("SECRETA"))));

        // Un header de tenant enviado por el cliente se ignora: B sigue viendo solo lo suyo
        mvc.perform(get("/api/v1/branches")
                        .header(HttpHeaders.AUTHORIZATION, sessionB.bearer())
                        .header("X-Tenant-ID", tenantA.toString())
                        .header("X-Tenant-Slug", slugA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].code", not(hasItem("SECRETA"))));

        // B escribe con el mismo código: queda en su schema, no choca con el de A
        api.postWith(sessionB, "/api/v1/branches", """
                {"code":"SECRETA","name":"Sucursal de B"}
                """).andExpect(status().isCreated());

        assertThat(jdbc.queryForObject("SELECT name FROM t_" + slugA + ".branches WHERE code = 'SECRETA'", String.class))
                .isEqualTo("Sucursal secreta de A");
        assertThat(jdbc.queryForObject("SELECT name FROM t_" + slugB + ".branches WHERE code = 'SECRETA'", String.class))
                .isEqualTo("Sucursal de B");

        // A ve 2 sucursales (principal + secreta)
        api.getWith(sessionA, "/api/v1/branches").andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void tamperedTenantClaimIsRejected() throws Exception {
        Session ownerA = api.registerAndLogin("tamper-a");
        UUID tenantA = api.createTenant(ownerA, TestApi.uniqueSlug("tampa"));
        Session ownerB = api.registerAndLogin("tamper-b");
        UUID tenantB = api.createTenant(ownerB, TestApi.uniqueSlug("tampb"));
        Session sessionB = api.selectTenant(ownerB, tenantB);

        String[] parts = sessionB.accessToken().split("\\.");
        String payload = new String(Base64.getUrlDecoder().decode(parts[1]));
        String forged = payload.replace(tenantB.toString(), tenantA.toString());
        String forgedToken = parts[0] + "." + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(forged.getBytes()) + "." + parts[2];

        mvc.perform(get("/api/v1/branches").header(HttpHeaders.AUTHORIZATION, "Bearer " + forgedToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refreshKeepsTenantAndRecomputesPermissions() throws Exception {
        Session owner = api.registerAndLogin("refresh-tenant");
        UUID tenantId = api.createTenant(owner, TestApi.uniqueSlug("reft"));
        Session tenantSession = api.selectTenant(owner, tenantId);

        String body = api.refreshRaw(tenantSession.refreshToken())
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(body, "$.tenantId")).isEqualTo(tenantId.toString());
        List<String> permissions = JsonPath.read(body, "$.permissions");
        assertThat(permissions).contains("sales:void", "branches:manage");

        // El refresh de plataforma usado al seleccionar negocio quedó revocado
        api.refreshRaw(owner.refreshToken()).andExpect(status().isUnauthorized());
    }
}
