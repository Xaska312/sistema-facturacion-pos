package com.poshibrido.tenancy;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PlatformIT extends IntegrationTest {

    @Test
    void configuredAccountIsPlatformAdminAfterSyncAndOthersAreNot() throws Exception {
        Session admin = platformAdmin();
        assertThat(payload(admin)).contains("\"padm\":true");
        api.getWith(admin, "/api/v1/auth/me").andExpect(jsonPath("$.user.platformAdmin").value(true));
        api.getWith(admin, "/api/v1/platform/tenants").andExpect(status().isOk());

        Session regular = api.registerAndLogin("noadmin");
        assertThat(payload(regular)).doesNotContain("padm");
        api.getWith(regular, "/api/v1/platform/tenants").andExpect(status().isForbidden());
        api.postWith(regular, "/api/v1/platform/tenants/" + UUID.randomUUID() + "/reactivate", "{}")
                .andExpect(status().isForbidden());
    }

    @Test
    void suspendedBusinessCannotBeUsedUntilReactivated() throws Exception {
        Owned owner = api.newTenant("susp");
        Joined cashier = api.joinAs(owner.tenant(), owner.tenantId(), "CASHIER");
        Session admin = platformAdmin();
        String base = "/api/v1/platform/tenants/" + owner.tenantId();

        api.postWith(admin, base + "/suspend", "{\"reason\":\"\"}").andExpect(status().isBadRequest());
        api.postWith(admin, base + "/suspend", "{\"reason\":\"Pago pendiente\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUSPENDED"))
                .andExpect(jsonPath("$.suspensionReason").value("Pago pendiente"))
                .andExpect(jsonPath("$.closedByOwner").value(false));
        api.postWith(admin, base + "/suspend", "{\"reason\":\"Otra vez\"}").andExpect(status().isConflict());

        // Los tokens vigentes ya no sirven y las sesiones no se pueden renovar.
        api.getWith(owner.tenant(), "/api/v1/branches").andExpect(status().isForbidden());
        api.getWith(cashier.session(), "/api/v1/branches").andExpect(status().isForbidden());
        api.refreshRaw(owner.tenant().refreshToken()).andExpect(status().isUnauthorized());

        // Al iniciar sesión, el negocio aparece suspendido con su motivo y no se puede entrar.
        Session again = api.login(owner.email());
        api.getWith(again, "/api/v1/tenants")
                .andExpect(jsonPath("$[0].status").value("SUSPENDED"))
                .andExpect(jsonPath("$[0].suspensionReason").value("Pago pendiente"));
        api.selectTenantRaw(again, owner.tenantId()).andExpect(status().isForbidden());

        String list = api.getWith(admin, "/api/v1/platform/tenants?status=SUSPENDED&q=" + owner.slug())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].ownerEmail").value(owner.email()))
                .andExpect(jsonPath("$.content[0].activeMembers").value(2))
                .andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(list, "$.content[0].suspensionReason")).isEqualTo("Pago pendiente");

        api.postWith(admin, base + "/reactivate", "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.suspensionReason").doesNotExist());
        api.postWith(admin, base + "/reactivate", "{}").andExpect(status().isConflict());
        Session back = api.selectTenant(api.login(owner.email()), owner.tenantId());
        api.getWith(back, "/api/v1/branches").andExpect(status().isOk());

        String schema = "t_" + owner.slug();
        List<String> actions = jdbc.queryForList("SELECT action FROM " + schema
                + ".audit_log WHERE entity = 'business' ORDER BY created_at, id", String.class);
        assertThat(actions).containsSubsequence("BUSINESS_CREATED", "BUSINESS_SUSPENDED", "BUSINESS_REACTIVATED");
        List<String> events = jdbc.queryForList("""
                SELECT event FROM platform.security_events WHERE tenant_id = ? ORDER BY occurred_at, id""",
                String.class, owner.tenantId());
        assertThat(events).contains("TENANT_SUSPENDED", "TENANT_REACTIVATED", "TENANT_ACCESS_DENIED");
    }

    @Test
    void ownerClosesBusinessWithNameAndPassword() throws Exception {
        Owned owner = api.newTenant("cierre");
        Joined admin = api.joinAs(owner.tenant(), owner.tenantId(), "ADMIN");
        String path = "/api/v1/tenants/" + owner.tenantId() + "/close";
        String tradeName = "Tienda " + owner.slug();

        api.postWith(admin.session(), path, body(tradeName, TestApi.PASSWORD))
                .andExpect(status().isForbidden());
        api.postWith(owner.tenant(), path, body("Otro nombre", TestApi.PASSWORD)).andExpect(status().is(422));
        api.postWith(owner.tenant(), path, body(tradeName, "ClaveEquivocada1")).andExpect(status().is(422));
        Integer denied = jdbc.queryForObject("SELECT count(*) FROM platform.security_events"
                + " WHERE event = 'TENANT_CLOSE_DENIED' AND tenant_id = ?", Integer.class, owner.tenantId());
        assertThat(denied).isEqualTo(1);
        api.getWith(owner.tenant(), "/api/v1/branches").andExpect(status().isOk());

        // El nombre se compara sin distinguir mayúsculas ni espacios de los extremos.
        api.postWith(owner.tenant(), path, body("  " + tradeName.toUpperCase() + " ", TestApi.PASSWORD))
                .andExpect(status().isNoContent());
        api.getWith(owner.tenant(), "/api/v1/branches").andExpect(status().isForbidden());
        api.getWith(admin.session(), "/api/v1/branches").andExpect(status().isForbidden());

        Session again = api.login(owner.email());
        api.getWith(again, "/api/v1/tenants")
                .andExpect(jsonPath("$[0].status").value("SUSPENDED"))
                .andExpect(jsonPath("$[0].closedByOwner").value(true))
                .andExpect(jsonPath("$[0].suspensionReason").value("Me retiro"));
        // Solo el administrador de plataforma lo reactiva.
        api.postWith(again, "/api/v1/platform/tenants/" + owner.tenantId() + "/reactivate", "{}")
                .andExpect(status().isForbidden());
        api.postWith(platformAdmin(), "/api/v1/platform/tenants/" + owner.tenantId() + "/reactivate", "{}")
                .andExpect(status().isOk());
    }

    private static String body(String confirmation, String password) {
        return """
                {"confirmation":"%s","password":"%s","reason":"Me retiro"}
                """.formatted(confirmation, password);
    }

    private static String payload(Session session) {
        return new String(Base64.getUrlDecoder().decode(session.accessToken().split("\\.")[1]),
                StandardCharsets.UTF_8);
    }
}
