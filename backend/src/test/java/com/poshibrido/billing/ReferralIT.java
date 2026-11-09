package com.poshibrido.billing;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Referidos y aliados (decisión 312): el invitado entra con XASKA IA en su prueba; cuenta cuando paga; quien invitó
 * gana un mes de XASKA IA (correo); el aliado gana el 20 % del primer pago y el administrador lo marca pagado.
 */
class ReferralIT extends IntegrationTest {

    private static String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }

    private ResultActions createWithCode(Session platform, String slug, String code) throws Exception {
        return mvc.perform(post("/api/v1/tenants").header(HttpHeaders.AUTHORIZATION, platform.bearer())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"slug":"%s","legalName":"%s S.A.S.","tradeName":"Tienda %s","businessType":"RETAIL",
                         "referralCode":"%s"}""".formatted(slug, slug, slug, code)));
    }

    private void pay(Session admin, UUID tenantId, int amount) throws Exception {
        api.postWith(admin, "/api/v1/platform/tenants/" + tenantId + "/subscription/payments", """
                {"planCode":"PRO","billingCycle":"MONTHLY","periods":1,"amount":%d,"method":"Bre-B","reference":"R1"}
                """.formatted(amount)).andExpect(status().isCreated());
    }

    @Test
    void aReferredBusinessCountsWhenItPaysAndTheReferrerGetsAMonthOfAi() throws Exception {
        Owned host = api.newTenant("invita");
        String mine = body(api.getWith(host.tenant(), "/api/v1/billing/referrals").andExpect(status().isOk()));
        String code = JsonPath.read(mine, "$.code");
        assertThat(code).matches("[A-Z0-9]{3,6}-[A-Z2-9]{3}");
        assertThat((String) JsonPath.read(mine, "$.link")).endsWith("/registro?ref=" + code);
        // El mismo código cada vez.
        api.getWith(host.tenant(), "/api/v1/billing/referrals").andExpect(jsonPath("$.code").value(code));

        // Un código de un negocio propio o inexistente no se acepta y el negocio no se crea.
        createWithCode(host.platform(), TestApi.uniqueSlug("propio"), code).andExpect(status().is(422));
        String email = TestApi.uniqueEmail("invitado");
        api.register(email);
        Session guest = api.login(email);
        createWithCode(guest, TestApi.uniqueSlug("malo"), "NOEXISTE-123").andExpect(status().is(422));

        String slug = TestApi.uniqueSlug("invitado");
        String created = body(createWithCode(guest, slug, " " + code.toLowerCase() + " ").andExpect(status().isCreated()));
        UUID guestTenant = UUID.fromString(JsonPath.read(created, "$.id"));
        Session guestSession = api.selectTenant(api.login(email), guestTenant);
        // XASKA IA desde el primer día de su prueba (y ya no puede pedir otra prueba de IA).
        api.getWith(guestSession, "/api/v1/ai/usage").andExpect(status().isOk());
        api.getWith(guestSession, "/api/v1/subscription").andExpect(jsonPath("$.aiTrialAvailable").value(false));
        api.getWith(host.tenant(), "/api/v1/billing/referrals").andExpect(jsonPath("$.invited").value(1))
                .andExpect(jsonPath("$.paid").value(0)).andExpect(jsonPath("$.list[0].status").value("PENDING"));

        Session admin = platformAdmin();
        pay(admin, guestTenant, 59900);
        api.getWith(host.tenant(), "/api/v1/billing/referrals").andExpect(jsonPath("$.paid").value(1))
                .andExpect(jsonPath("$.monthsEarned").value(1)).andExpect(jsonPath("$.list[0].status").value("QUALIFIED"));
        Timestamp aiEnds = jdbc.queryForObject("""
                SELECT ends_at FROM platform.subscription_addons WHERE tenant_id = ? AND addon_code = 'AI' AND NOT trial""",
                Timestamp.class, host.tenantId());
        assertThat(aiEnds.toInstant()).isAfter(Instant.now().plus(27, ChronoUnit.DAYS));
        assertThat(mailbox.last(host.email(), "referido-premio")).isPresent();
        // Un segundo pago no vuelve a premiar.
        pay(admin, guestTenant, 59900);
        assertThat(jdbc.queryForObject("""
                SELECT ends_at FROM platform.subscription_addons WHERE tenant_id = ? AND addon_code = 'AI'""",
                Timestamp.class, host.tenantId())).isEqualTo(aiEnds);
    }

    @Test
    void aPartnerEarnsTwentyPercentOfTheFirstPayment() throws Exception {
        Session admin = platformAdmin();
        String partner = body(api.postWith(admin, "/api/v1/platform/partners", """
                {"name":"Contadora Ruiz","kind":"ACCOUNTANT","phone":"3001234567","payoutKey":"@RUIZ","active":true}
                """).andExpect(status().isOk()));
        String code = JsonPath.read(partner, "$.code");
        assertThat(code).startsWith("CONTAD-");
        api.postWith(admin, "/api/v1/platform/partners", "{\"name\":\"X\",\"kind\":\"OTRO\",\"active\":true}")
                .andExpect(status().is(422));

        String email = TestApi.uniqueEmail("cliente-contador");
        api.register(email);
        String created = body(createWithCode(api.login(email), TestApi.uniqueSlug("cliente"), code)
                .andExpect(status().isCreated()));
        UUID tenant = UUID.fromString(JsonPath.read(created, "$.id"));
        // Aún no pagó: no se le puede marcar comisión.
        api.postWith(admin, "/api/v1/platform/referrals/" + tenant + "/paid", "{\"reference\":\"B1\"}")
                .andExpect(status().is(422));
        pay(admin, tenant, 59900);
        api.getWith(admin, "/api/v1/platform/referrals").andExpect(status().isOk());
        String list = body(api.getWith(admin, "/api/v1/platform/partners"));
        net.minidev.json.JSONArray owed = JsonPath.read(list, "$[?(@.code == '" + code + "')].commissionOwed");
        assertThat(((Number) owed.getFirst()).intValue()).isEqualTo(11980);
        api.postWith(admin, "/api/v1/platform/referrals/" + tenant + "/paid", "{\"reference\":\"BREB-77\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.paidReference").value("BREB-77"))
                .andExpect(jsonPath("$.commission").value(11980));
        api.postWith(admin, "/api/v1/platform/referrals/" + tenant + "/paid", "{\"reference\":\"BREB-77\"}")
                .andExpect(status().is(422));
        // Un aliado inactivo ya no sirve para registrarse.
        String id = JsonPath.read(partner, "$.id");
        api.putWith(admin, "/api/v1/platform/partners/" + id, """
                {"name":"Contadora Ruiz","kind":"ACCOUNTANT","active":false}""").andExpect(status().isOk());
        String other = TestApi.uniqueEmail("tarde");
        api.register(other);
        createWithCode(api.login(other), TestApi.uniqueSlug("tarde"), code).andExpect(status().is(422));
    }
}
