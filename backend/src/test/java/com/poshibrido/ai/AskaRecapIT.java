package com.poshibrido.ai;

import com.poshibrido.ai.application.AskaRecapService;
import com.poshibrido.mail.MailMessage;
import com.poshibrido.subscription.application.SubscriptionService;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.YearMonth;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * "Lo que hiciste con Aska" (decisión 309): los conteos del mes (preguntas, productos de listas, resúmenes del día) y
 * el correo del final de la prueba gratis, que sale una sola vez y solo cuando le quedan 2 días o menos.
 */
class AskaRecapIT extends IntegrationTest {

    @Autowired
    private AskaRecapService recaps;
    @Autowired
    private SubscriptionService subscriptionService;

    @Test
    void countsTheMonthAndMailsTheTrialEndOnce() throws Exception {
        Owned owner = api.newTenant("aska-mes");
        Session s = owner.tenant();
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        TenantRef ref = new TenantRef(owner.tenantId(), owner.slug(), schema);

        // La tarjeta de Inicio es del dueño; un 204 fuera de los primeros días o sin nada que contar.
        api.getWith(s, "/api/v1/ai/recap").andExpect(status().is2xxSuccessful());

        jdbc.update("""
                INSERT INTO "%s".ai_questions (id, kind, status, created_by, created_at, items) VALUES
                  (gen_random_uuid(), 'QUESTION', 'OK', ?1, now(), 0),
                  (gen_random_uuid(), 'QUESTION', 'OK', ?1, now(), 0),
                  (gen_random_uuid(), 'QUESTION', 'FAILED', ?1, now(), 0),
                  (gen_random_uuid(), 'CATALOG_READ', 'OK', ?1, now(), 12)""".formatted(schema).replace("?1", "?"),
                owner.ownerId(), owner.ownerId(), owner.ownerId(), owner.ownerId());
        try {
            TenantContext.set(ref);
            YearMonth month = YearMonth.now(ZoneId.of("America/Bogota"));
            AskaRecapService.Recap r = recaps.month(month);
            assertThat(r.questions()).isEqualTo(2);
            assertThat(r.products()).isEqualTo(12);
            assertThat(r.minutesSaved()).isEqualTo(22);
            assertThat(r.title()).startsWith("Tu ").endsWith(" con Aska");

            // Sin prueba, no hay correo de prueba.
            assertThat(recaps.sendTrialIfDue()).isFalse();
        } finally {
            TenantContext.clear();
        }

        api.postEmpty(s, "/api/v1/billing/ai-trial").andExpect(status().isOk());
        try {
            TenantContext.set(ref);
            // Con 14 días por delante todavía no.
            assertThat(recaps.sendTrialIfDue()).isFalse();
            jdbc.update("UPDATE platform.subscription_addons SET ends_at = now() + interval '36 hours' "
                    + "WHERE tenant_id = ? AND trial", owner.tenantId());
            subscriptionService.evict(owner.tenantId());
            assertThat(recaps.sendTrialIfDue()).isTrue();
            assertThat(recaps.sendTrialIfDue()).as("una sola vez").isFalse();
        } finally {
            TenantContext.clear();
        }
        MailMessage mail = mailbox.last(owner.email(), "aska-prueba").orElseThrow();
        assertThat(mail.senderName()).isEqualTo("Aska de XASKA");
        assertThat(mail.subject()).isEqualTo("Aska · Te ahorré cerca de 22 minutos en tu prueba");
        assertThat(mail.html()).contains("Respondí 2 preguntas").contains("Pasé 12 productos")
                .contains("Quedarme con XASKA IA").contains("/app/planes");
        assertThat(mail.text()).contains("Tu prueba gratis termina el");
    }
}
