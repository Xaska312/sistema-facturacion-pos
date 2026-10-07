package com.poshibrido.identity;

import com.poshibrido.mail.MailMessage;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.RecordingMailSender;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Invite;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class EmailIT extends IntegrationTest {

    @Test
    void newAccountMustConfirmEmailBeforeCreatingABusiness() throws Exception {
        String email = TestApi.uniqueEmail("verif");
        UUID userId = api.registerUnverified(email);
        MailMessage welcome = mailbox.last(email, "verificacion").orElseThrow();
        assertThat(welcome.text()).contains("http://pos.test/verificar-correo?token=");
        assertThat(welcome.html()).contains("Confirmar mi correo");

        Session session = api.login(email);
        api.getWith(session, "/api/v1/auth/me").andExpect(jsonPath("$.user.emailVerified").value(false));
        api.createTenantRaw(session, TestApi.uniqueSlug("sinverif"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));

        // Reenviar en menos de un minuto: 429 (evita ráfagas de correos).
        api.postEmpty(session, "/api/v1/auth/verify-email/resend").andExpect(status().isTooManyRequests());

        String token = RecordingMailSender.tokenIn(welcome);
        api.postPublic("/api/v1/auth/verify-email", "{\"token\":\"%s\"}".formatted(token))
                .andExpect(status().isNoContent());
        api.postPublic("/api/v1/auth/verify-email", "{\"token\":\"%s\"}".formatted(token))
                .andExpect(status().is(422));
        api.postPublic("/api/v1/auth/verify-email", "{\"token\":\"no-existe\"}").andExpect(status().is(422));

        api.getWith(session, "/api/v1/auth/me").andExpect(jsonPath("$.user.emailVerified").value(true));
        api.createTenantRaw(session, TestApi.uniqueSlug("verif")).andExpect(status().isCreated());
        // Ya confirmado: reenviar no hace nada (ni error ni correo nuevo).
        int before = mailbox.sentTo(email).size();
        api.postEmpty(session, "/api/v1/auth/verify-email/resend").andExpect(status().isNoContent());
        assertThat(mailbox.sentTo(email)).hasSize(before);

        Integer verified = jdbc.queryForObject("SELECT count(*) FROM platform.security_events"
                + " WHERE event = 'EMAIL_VERIFIED' AND user_id = ?", Integer.class, userId);
        assertThat(verified).isEqualTo(1);
    }

    @Test
    void forgottenPasswordIsResetWithTheEmailedLink() throws Exception {
        String email = TestApi.uniqueEmail("olvido");
        api.register(email);
        Session old = api.login(email);
        for (int i = 0; i < 5; i++) {
            api.loginRaw(email, "ClaveEquivocada1").andExpect(status().isUnauthorized());
        }
        api.loginRaw(email, TestApi.PASSWORD).andExpect(status().isLocked());

        // Correo inexistente: misma respuesta, sin correo.
        String nobody = TestApi.uniqueEmail("nadie");
        api.postPublic("/api/v1/auth/password-reset/request", "{\"email\":\"%s\"}".formatted(nobody))
                .andExpect(status().isNoContent());
        assertThat(mailbox.sentTo(nobody)).isEmpty();

        api.postPublic("/api/v1/auth/password-reset/request", "{\"email\":\"%s\"}".formatted(email.toUpperCase()))
                .andExpect(status().isNoContent());
        api.postPublic("/api/v1/auth/password-reset/request", "{\"email\":\"%s\"}".formatted(email))
                .andExpect(status().isNoContent());
        assertThat(mailbox.sentTo(email).stream().filter(m -> m.kind().equals("restablecer-clave"))).hasSize(1);
        MailMessage reset = mailbox.last(email, "restablecer-clave").orElseThrow();
        assertThat(reset.text()).contains("http://pos.test/restablecer-clave?token=");
        String token = RecordingMailSender.tokenIn(reset);

        api.postPublic("/api/v1/auth/password-reset/confirm", "{\"token\":\"%s\",\"password\":\"corta\"}"
                .formatted(token)).andExpect(status().isBadRequest());
        String newPassword = "ClaveNueva2026";
        api.postPublic("/api/v1/auth/password-reset/confirm", "{\"token\":\"%s\",\"password\":\"%s\"}"
                .formatted(token, newPassword)).andExpect(status().isNoContent());
        api.postPublic("/api/v1/auth/password-reset/confirm", "{\"token\":\"%s\",\"password\":\"%s\"}"
                .formatted(token, newPassword)).andExpect(status().is(422));

        // La cuenta se desbloquea, las sesiones anteriores se cierran y llega el aviso.
        api.refreshRaw(old.refreshToken()).andExpect(status().isUnauthorized());
        api.loginRaw(email, TestApi.PASSWORD).andExpect(status().isUnauthorized());
        api.loginRaw(email, newPassword).andExpect(status().isOk());
        assertThat(mailbox.last(email, "clave-cambiada")).isPresent();
    }

    @Test
    void invitationIsEmailedAndCanBeResentWithANewLink() throws Exception {
        Owned owner = api.newTenant("invmail");
        String email = TestApi.uniqueEmail("invitado");
        Invite invite = api.invite(owner.tenant(), email, api.roleId(owner.tenant(), "CASHIER"),
                api.principalBranchId(owner.tenant()));
        MailMessage first = mailbox.last(email, "invitacion").orElseThrow();
        assertThat(RecordingMailSender.tokenIn(first)).isEqualTo(invite.token());
        assertThat(first.subject()).contains("Tienda " + owner.slug());
        assertThat(first.text()).contains("Cajero");

        String body = api.postEmpty(owner.tenant(), "/api/v1/members/invitations/" + invite.invitationId() + "/resend")
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String newToken = com.jayway.jsonpath.JsonPath.read(body, "$.token");
        assertThat(newToken).isNotEqualTo(invite.token());
        assertThat(RecordingMailSender.tokenIn(mailbox.last(email, "invitacion").orElseThrow())).isEqualTo(newToken);

        // Sin confirmar su correo, al aceptar la invitación (que llegó a ese correo) queda confirmado.
        UUID userId = api.registerUnverified(email);
        Session invited = api.login(email);
        api.acceptRaw(invited, invite.token()).andExpect(status().isConflict());
        api.acceptRaw(invited, newToken).andExpect(status().isOk());
        Boolean verified = jdbc.queryForObject("SELECT email_verified_at IS NOT NULL FROM platform.users WHERE id = ?",
                Boolean.class, userId);
        assertThat(verified).isTrue();
    }

    @Test
    void ownerIsEmailedWhenTheBusinessIsSuspendedReactivatedOrClosed() throws Exception {
        Owned owner = api.newTenant("avisos");
        Session admin = platformAdmin();
        String base = "/api/v1/platform/tenants/" + owner.tenantId();

        api.postWith(admin, base + "/suspend", "{\"reason\":\"Pago <pendiente>\"}").andExpect(status().isOk());
        MailMessage suspended = mailbox.last(owner.email(), "negocio-suspendido").orElseThrow();
        assertThat(suspended.text()).contains("Pago <pendiente>");
        assertThat(suspended.html()).contains("Pago &lt;pendiente&gt;").doesNotContain("<pendiente>");

        api.postWith(admin, base + "/reactivate", "{}").andExpect(status().isOk());
        assertThat(mailbox.last(owner.email(), "negocio-reactivado")).isPresent();

        Session tenant = api.selectTenant(api.login(owner.email()), owner.tenantId());
        api.postWith(tenant, "/api/v1/tenants/" + owner.tenantId() + "/close", """
                {"confirmation":"Tienda %s","password":"%s","reason":"Cierro el local"}
                """.formatted(owner.slug(), TestApi.PASSWORD)).andExpect(status().isNoContent());
        assertThat(mailbox.last(owner.email(), "negocio-cerrado")).isPresent();
    }

    @Test
    void platformAdminRequiresAConfirmedEmail() throws Exception {
        platformAdmin();
        jdbc.update("UPDATE platform.users SET platform_admin = FALSE, email_verified_at = NULL WHERE email = ?",
                TestApi.PLATFORM_ADMIN_EMAIL);
        try {
            platformAdmins.syncConfiguredAdmins();
            Boolean admin = jdbc.queryForObject("SELECT platform_admin FROM platform.users WHERE email = ?",
                    Boolean.class, TestApi.PLATFORM_ADMIN_EMAIL);
            assertThat(admin).isFalse();
        } finally {
            platformAdmin(); // deja la cuenta confirmada y con permiso para los demás tests
        }
    }
}
