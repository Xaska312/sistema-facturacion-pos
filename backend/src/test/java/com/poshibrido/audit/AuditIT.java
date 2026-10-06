package com.poshibrido.audit;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuditIT extends IntegrationTest {

    // ---------------------------------------------------------------- eventos de seguridad (plataforma)

    @Test
    void loginAttemptsAreRecordedEvenWhenTheyFail() throws Exception {
        String email = TestApi.uniqueEmail("seclog");
        UUID userId = api.register(email);
        assertThat(events(userId)).containsExactly("REGISTERED");

        api.loginRaw(email, "ClaveEquivocada1").andExpect(status().isUnauthorized());
        assertThat(reasons(userId)).containsExactly("BAD_PASSWORD");

        for (int i = 0; i < 4; i++) {
            api.loginRaw(email, "ClaveEquivocada1").andExpect(status().isUnauthorized());
        }
        // Quinto fallo: la cuenta queda bloqueada y el siguiente intento (aun con la clave correcta) también se registra.
        api.loginRaw(email, TestApi.PASSWORD).andExpect(status().isLocked());
        assertThat(events(userId)).contains("ACCOUNT_LOCKED");
        assertThat(reasons(userId)).contains("LOCKED");

        String unknown = TestApi.uniqueEmail("nadie");
        api.loginRaw(unknown, TestApi.PASSWORD).andExpect(status().isUnauthorized());
        String reason = jdbc.queryForObject("""
                SELECT details->>'reason' FROM platform.security_events
                WHERE event = 'LOGIN_FAILED' AND email = ? AND user_id IS NULL""", String.class, unknown);
        assertThat(reason).isEqualTo("UNKNOWN_EMAIL");
    }

    @Test
    void enteringAndLeavingABusinessIsRecordedInBothLogs() throws Exception {
        Owned owner = api.newTenant("secbiz");
        String schema = "t_" + owner.slug();

        assertThat(events(owner.ownerId()))
                .contains("REGISTERED", "LOGIN_SUCCEEDED", "TENANT_CREATED", "TENANT_ENTERED");
        assertThat(actions(schema)).contains("BUSINESS_CREATED", "SESSION_STARTED");

        mvc.perform(post("/api/v1/auth/logout").cookie(owner.tenant().refreshCookie()))
                .andExpect(status().isNoContent());
        assertThat(events(owner.ownerId())).contains("LOGOUT");
        assertThat(actions(schema)).contains("SESSION_ENDED");
        // Cerrar sesión dos veces con la misma cookie no duplica el registro.
        mvc.perform(post("/api/v1/auth/logout").cookie(owner.tenant().refreshCookie()))
                .andExpect(status().isNoContent());
        assertThat(actions(schema).stream().filter("SESSION_ENDED"::equals)).hasSize(1);

        // Entrar a un negocio ajeno: 403 y queda registrado (la transacción no se revierte).
        Session stranger = api.registerAndLogin("intruso");
        api.selectTenantRaw(stranger, owner.tenantId()).andExpect(status().isForbidden());
        Integer denied = jdbc.queryForObject("""
                SELECT count(*) FROM platform.security_events WHERE event = 'TENANT_ACCESS_DENIED' AND tenant_id = ?""",
                Integer.class, owner.tenantId());
        assertThat(denied).isEqualTo(1);
    }

    @Test
    void reusingARotatedRefreshTokenIsRecorded() throws Exception {
        String email = TestApi.uniqueEmail("reuse");
        UUID userId = api.register(email);
        Session session = api.login(email);
        api.refreshRaw(session.refreshToken()).andExpect(status().isOk());
        api.refreshRaw(session.refreshToken()).andExpect(status().isUnauthorized());
        assertThat(events(userId)).contains("REFRESH_TOKEN_REUSED");
    }

    @Test
    void securityEventsAreImmutable() throws Exception {
        UUID userId = api.register(TestApi.uniqueEmail("inmut"));
        assertThatThrownBy(() -> jdbc.update("UPDATE platform.security_events SET event = 'X' WHERE user_id = ?",
                userId)).hasMessageContaining("inmutables");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM platform.security_events WHERE user_id = ?", userId))
                .hasMessageContaining("inmutables");
    }

    @Test
    void onlyPlatformAdminsCanReadSecurityEvents() throws Exception {
        String email = TestApi.uniqueEmail("padmin");
        UUID adminId = api.register(email);
        Session regular = api.login(email);
        api.getWith(regular, "/api/v1/platform/security-events").andExpect(status().isForbidden());

        jdbc.update("UPDATE platform.users SET platform_admin = true WHERE id = ?", adminId);
        Session admin = api.login(email);
        String body = api.getWith(admin, "/api/v1/platform/security-events?q=" + email + "&size=10")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].email").value(email))
                .andReturn().getResponse().getContentAsString();
        List<String> found = JsonPath.read(body, "$.content[*].event");
        assertThat(found).contains("REGISTERED", "LOGIN_SUCCEEDED");

        api.getWith(admin, "/api/v1/platform/security-events?event=NO_EXISTE").andExpect(status().is(422));
    }

    // ---------------------------------------------------------------- auditoría del negocio

    @Test
    void ownerQueriesAuditWithFiltersAndDetail() throws Exception {
        Owned owner = api.newTenant("audq");
        api.postWith(owner.tenant(), "/api/v1/branches", """
                {"code":"NORTE","name":"Sede Norte 50%","cityCode":"11001"}
                """).andExpect(status().isCreated());

        String list = api.getWith(owner.tenant(), "/api/v1/audit")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.content[0].action").value("BRANCH_CREATED"))
                .andExpect(jsonPath("$.content[0].label").value("Sede Norte 50%"))
                .andExpect(jsonPath("$.content[0].actorName").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        List<String> actions = JsonPath.read(list, "$.content[*].action");
        // TENANT_PROVISIONED: el sembrado del dueño como miembro, justo antes de BUSINESS_CREATED.
        assertThat(actions).containsExactly("BRANCH_CREATED", "SESSION_STARTED", "BUSINESS_CREATED",
                "TENANT_PROVISIONED");

        // Búsqueda en los datos (el % se busca literal, no como comodín).
        mvc.perform(get("/api/v1/audit").param("q", "50%")
                        .header(HttpHeaders.AUTHORIZATION, owner.tenant().bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(owner.tenant(), "/api/v1/audit?action=BUSINESS_CREATED&actorId=" + owner.ownerId())
                .andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(owner.tenant(), "/api/v1/audit?entity=sale").andExpect(jsonPath("$.totalElements").value(0));

        String businessId = JsonPath.read(list, "$.content[2].id");
        api.getWith(owner.tenant(), "/api/v1/audit/" + businessId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.after.slug").value(owner.slug()))
                .andExpect(jsonPath("$.before").doesNotExist());
        api.getWith(owner.tenant(), "/api/v1/audit/" + UUID.randomUUID()).andExpect(status().isNotFound());

        String options = api.getWith(owner.tenant(), "/api/v1/audit/actions").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> entities = JsonPath.read(options, "$[*].entity");
        assertThat(entities).contains("branch", "business", "session");
        api.getWith(owner.tenant(), "/api/v1/audit/actors")
                .andExpect(jsonPath("$[0].id").value(owner.ownerId().toString()));

        api.getWith(owner.tenant(), "/api/v1/audit?from=2026-01-10&to=2026-01-01").andExpect(status().is(422));
        api.getWith(owner.tenant(), "/api/v1/audit?from=2024-01-01&to=2026-01-01").andExpect(status().is(422));
    }

    @Test
    void auditCsvIsSpanishAndTheExportItselfIsAudited() throws Exception {
        Owned owner = api.newTenant("audcsv");
        MockHttpServletResponse response = api.getWith(owner.tenant(), "/api/v1/audit/export.csv")
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getHeader("Content-Disposition")).contains("auditoria_");
        String csv = new String(response.getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(csv).contains("Fecha;Usuario;Acción;Módulo;Registro").contains("Creó el negocio;Negocio")
                .contains("Entró al negocio;Sesión");

        assertThat(actions("t_" + owner.slug())).contains("AUDIT_EXPORTED");
    }

    @Test
    void reportExportsAreAudited() throws Exception {
        Owned owner = api.newTenant("audrep");
        api.getWith(owner.tenant(), "/api/v1/reports/sales/by-day.csv").andExpect(status().isOk());
        String file = jdbc.queryForObject("SELECT after_data->>'file' FROM t_" + owner.slug()
                + ".audit_log WHERE action = 'REPORT_EXPORTED'", String.class);
        assertThat(file).startsWith("ventas-por-dia").endsWith(".csv");
    }

    @Test
    void auditPermissionIsForOwnerAdminAndAccountantOnly() throws Exception {
        Owned owner = api.newTenant("audperm");
        Joined accountant = api.joinAs(owner.tenant(), owner.tenantId(), "ACCOUNTANT");
        Joined cashier = api.joinAs(owner.tenant(), owner.tenantId(), "CASHIER");

        api.getWith(accountant.session(), "/api/v1/audit").andExpect(status().isOk());
        api.getWith(cashier.session(), "/api/v1/audit").andExpect(status().isForbidden());
        api.getWith(cashier.session(), "/api/v1/audit/export.csv").andExpect(status().isForbidden());

        // Los registros de otro negocio no se ven (cada negocio consulta su propio schema).
        Owned other = api.newTenant("audotro");
        String body = api.getWith(other.tenant(), "/api/v1/audit?size=100").andReturn().getResponse()
                .getContentAsString();
        List<String> actors = JsonPath.read(body, "$.content[*].actorId");
        assertThat(actors).doesNotContain(owner.ownerId().toString(), accountant.userId().toString());
    }

    @Test
    void businessAuditIsImmutable() throws Exception {
        Owned owner = api.newTenant("audinm");
        String schema = "t_" + owner.slug();
        assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".audit_log SET action = 'X'"))
                .hasMessageContaining("inmutables");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM " + schema + ".audit_log"))
                .hasMessageContaining("inmutables");
    }

    // ---------------------------------------------------------------- apoyo

    private List<String> events(UUID userId) {
        return jdbc.queryForList("SELECT event FROM platform.security_events WHERE user_id = ? ORDER BY occurred_at, id",
                String.class, userId);
    }

    private List<String> reasons(UUID userId) {
        return jdbc.queryForList("""
                SELECT details->>'reason' FROM platform.security_events
                WHERE user_id = ? AND event = 'LOGIN_FAILED' ORDER BY occurred_at, id""", String.class, userId);
    }

    private List<String> actions(String schema) {
        return jdbc.queryForList("SELECT action FROM " + schema + ".audit_log ORDER BY created_at, id", String.class);
    }
}
