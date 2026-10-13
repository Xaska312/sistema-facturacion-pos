package com.poshibrido.subscription;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.catalog.CatalogFixturesAccess;
import com.poshibrido.subscription.application.SubscriptionProperties;
import com.poshibrido.subscription.application.SubscriptionReminders;
import com.poshibrido.subscription.application.SubscriptionService;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Fase 8b: prueba gratis, códigos de activación, límites del plan, solo consulta al vencer, pagos y avisos. */
class SubscriptionIT extends IntegrationTest {

    @Autowired
    private SubscriptionService subscriptions;

    @Autowired
    private SubscriptionReminders reminders;

    @Autowired
    private SubscriptionProperties properties;

    /** Por defecto (sin SUBSCRIPTION_TRIAL_WITHOUT_CODE) ningún negocio se crea sin código de activación. */
    @Test
    void withoutFreeTrialEveryBusinessNeedsAnActivationCode() throws Exception {
        Object target = AopTestUtils.getUltimateTargetObject(subscriptions);
        SubscriptionProperties strict = new SubscriptionProperties(properties.trialDays(), properties.trialPlan(),
                properties.graceDays(), properties.paymentInstructions(), properties.remindersEnabled(), false);
        ReflectionTestUtils.setField(target, "properties", strict);
        try {
            Session user = api.registerAndLogin("sincodigo");
            api.getWith(user, "/api/v1/tenants/signup-terms").andExpect(status().isOk())
                    .andExpect(jsonPath("$.activationCodeRequired").value(true));
            api.createTenantRaw(user, TestApi.uniqueSlug("sincod"))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.code").value("ACTIVATION_CODE_REQUIRED"));
        } finally {
            ReflectionTestUtils.setField(target, "properties", properties);
        }
    }

    @Test
    void firstBusinessStartsATrialAndAnotherOneNeedsAnActivationCode() throws Exception {
        Owned owner = api.newTenant("susc");
        api.getWith(owner.tenant(), "/api/v1/subscription")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("TRIAL"))
                .andExpect(jsonPath("$.plan.code").value("PRO"))
                .andExpect(jsonPath("$.daysLeft").value(14))
                .andExpect(jsonPath("$.usage.branches").value(1))
                .andExpect(jsonPath("$.usage.users").value(1));

        // Una prueba por cuenta.
        api.createTenantRaw(owner.platform(), TestApi.uniqueSlug("susc2"))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.code").value("ACTIVATION_CODE_REQUIRED"));

        Session admin = platformAdmin();
        String code = newCode(admin, "BASIC", 3);
        String body = api.createTenantWithCode(owner.platform(), TestApi.uniqueSlug("susc2"), code.toLowerCase())
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID second = UUID.fromString(JsonPath.read(body, "$.id"));
        // Un código sirve una sola vez.
        api.createTenantWithCode(owner.platform(), TestApi.uniqueSlug("susc3"), code).andExpect(status().is(422));

        api.getWith(admin, "/api/v1/platform/tenants/" + second + "/subscription")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.plan.code").value("BASIC"))
                .andExpect(jsonPath("$.payments[0].source").value("CODE"))
                .andExpect(jsonPath("$.payments[0].periods").value(3));
        String codes = body(api.getWith(admin, "/api/v1/platform/activation-codes").andExpect(status().isOk()));
        assertThat((String) JsonPath.read(codes, "$[0].status")).isEqualTo("USED");

        // La consola es solo para administradores de plataforma.
        api.getWith(owner.platform(), "/api/v1/platform/plans").andExpect(status().isForbidden());
    }

    @Test
    void basicPlanLimitsBranchesAndUsers() throws Exception {
        Session admin = platformAdmin();
        String email = TestApi.uniqueEmail("basico");
        api.register(email);
        String body = api.createTenantWithCode(api.login(email), TestApi.uniqueSlug("basico"),
                        newCode(admin, "BASIC", 1))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Session s = api.selectTenant(api.login(email), UUID.fromString(JsonPath.read(body, "$.id")));

        api.postWith(s, "/api/v1/branches", """
                {"code":"sur","name":"Sede sur","cityCode":"11001"}
                """).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("sucursal")));

        UUID cashier = api.roleId(s, "CASHIER");
        UUID branch = api.principalBranchId(s);
        // Básico: 3 usuarios contando al dueño y las invitaciones pendientes.
        api.inviteRaw(s, TestApi.uniqueEmail("uno"), cashier, branch).andExpect(status().isCreated());
        api.inviteRaw(s, TestApi.uniqueEmail("dos"), cashier, branch).andExpect(status().isCreated());
        api.inviteRaw(s, TestApi.uniqueEmail("tres"), cashier, branch).andExpect(status().is(422));
    }

    @Test
    void expiredSubscriptionIsReadOnlyUntilAPaymentIsRegistered() throws Exception {
        Owned owner = api.newTenant("vence");
        String product = CatalogFixturesAccess.simpleProduct("VENCE-1", "Producto", "1", "7709999999901");

        // Plan pagado vencido hace un día: en gracia, todo sigue funcionando.
        setEnd(owner.tenantId(), false, "now() - interval '1 day'");
        api.getWith(owner.tenant(), "/api/v1/subscription").andExpect(jsonPath("$.status").value("PAST_DUE"));
        api.postWith(owner.tenant(), "/api/v1/products", product).andExpect(status().isCreated());

        // Prueba terminada: solo consulta.
        setEnd(owner.tenantId(), true, "now() - interval '1 hour'");
        api.getWith(owner.tenant(), "/api/v1/products").andExpect(status().isOk());
        api.postWith(owner.tenant(), "/api/v1/products",
                        CatalogFixturesAccess.simpleProduct("VENCE-2", "Otro", "1", "7709999999902"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SUBSCRIPTION_EXPIRED"));
        api.getWith(owner.tenant(), "/api/v1/subscription")
                .andExpect(jsonPath("$.status").value("EXPIRED"))
                .andExpect(jsonPath("$.daysLeft").value(0));

        Session admin = platformAdmin();
        api.postWith(admin, "/api/v1/platform/tenants/" + owner.tenantId() + "/subscription/payments", """
                {"planCode":"PRO","billingCycle":"MONTHLY","periods":1,"amount":90000,"method":"Nequi",
                 "reference":"M123"}
                """).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.daysLeft").value(org.hamcrest.Matchers.greaterThanOrEqualTo(28)));
        assertThat(mailbox.last(owner.email(), "suscripcion-pagada")).isPresent();
        api.postWith(owner.tenant(), "/api/v1/products",
                        CatalogFixturesAccess.simpleProduct("VENCE-2", "Otro", "1", "7709999999902"))
                .andExpect(status().isCreated());

        // Los pagos no se modifican ni se borran.
        assertThatThrownBy(() -> jdbc.update("DELETE FROM platform.subscription_payments WHERE tenant_id = ?",
                owner.tenantId())).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void remindersAreSentOncePerStage() throws Exception {
        Owned owner = api.newTenant("aviso");
        setEnd(owner.tenantId(), true, "now() + interval '2 days'");
        reminders.sendDue();
        reminders.sendDue();
        assertThat(mailbox.sentTo(owner.email()).stream().filter(m -> m.kind().equals("suscripcion-por-vencer")))
                .hasSize(1);

        setEnd(owner.tenantId(), true, "now() - interval '1 hour'");
        reminders.sendDue();
        assertThat(mailbox.last(owner.email(), "suscripcion-vencida")).isPresent();
    }

    @Test
    void platformAdminSetsPlanPrices() throws Exception {
        Session admin = platformAdmin();
        api.putWith(admin, "/api/v1/platform/plans/BASIC", """
                {"name":"Básico","maxBranches":1,"maxUsers":3,"monthlyPrice":59000,"annualPrice":590000,
                 "active":true}
                """).andExpect(status().isOk())
                .andExpect(jsonPath("$.monthlyPrice").value(org.hamcrest.Matchers.closeTo(59000.0, 0.001)));
        api.getWith(admin, "/api/v1/platform/subscriptions?status=TRIAL&size=5").andExpect(status().isOk());
    }

    private String newCode(Session admin, String plan, int months) throws Exception {
        String body = body(api.postWith(admin, "/api/v1/platform/activation-codes", """
                {"planCode":"%s","months":%d,"validDays":30,"note":"Venta de prueba","quantity":1}
                """.formatted(plan, months)).andExpect(status().isCreated()));
        return JsonPath.read(body, "$.codes[0]");
    }

    /** Cambia el fin de la suscripción (expresión SQL) y limpia la caché. */
    private void setEnd(UUID tenantId, boolean trial, String sqlInstant) {
        jdbc.update("UPDATE platform.subscriptions SET trial = ?, ends_at = " + sqlInstant + " WHERE tenant_id = ?",
                trial, tenantId);
        subscriptions.evict(tenantId);
    }

    private static String body(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }
}
