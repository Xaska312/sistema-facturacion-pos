package com.poshibrido.mail;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MailTemplatesTest {

    private final MailTemplates templates =
            new MailTemplates(new MailProperties("POS <a@b.co>", "", "https://pos.midominio.com/", false));

    @Test
    void userDataIsEscapedInHtmlButKeptInPlainText() {
        MailMessage mail = templates.invitation("ana@x.co", "Ana <b>\"Jefa\"</b>", "Tienda <script>alert(1)</script>",
                List.of("Cajero"), "abc_123", Instant.parse("2026-10-10T15:00:00Z"));

        assertThat(mail.html())
                .doesNotContain("<script>").doesNotContain("<b>")
                .contains("Tienda &lt;script&gt;alert(1)&lt;/script&gt;")
                .contains("Ana &lt;b&gt;&quot;Jefa&quot;&lt;/b&gt;")
                .contains("href=\"https://pos.midominio.com/invitacion/abc_123\"");
        assertThat(mail.text())
                .contains("Tienda <script>alert(1)</script>")
                .contains("https://pos.midominio.com/invitacion/abc_123")
                .contains("como Cajero")
                .contains("10 de octubre de 2026"); // 10:00 a. m. en Bogotá
        assertThat(mail.kind()).isEqualTo("invitacion");
        assertThat(mail.idempotencyKey()).isNotBlank();
    }

    @Test
    void linksUseThePublicUrlWithoutDoubleSlash() {
        MailMessage verify = templates.verifyEmail("a@b.co", "Ana", "tok");
        assertThat(verify.text()).contains("https://pos.midominio.com/verificar-correo?token=tok");
        MailMessage reset = templates.passwordReset("a@b.co", "Ana", "tok2");
        assertThat(reset.text()).contains("https://pos.midominio.com/restablecer-clave?token=tok2");
    }

    @Test
    void suspensionWithoutReasonSaysSo() {
        MailMessage mail = templates.tenantSuspended("a@b.co", "Ana", "Mi tienda", "  ");
        assertThat(mail.text()).contains("Motivo: no indicado.");
        assertThat(mail.subject()).isEqualTo("Mi tienda fue suspendido");
    }

    @Test
    void logsNeverShowTheFullEmail() {
        assertThat(Mailer.mask("ana.perez@gmail.com")).isEqualTo("a***@gmail.com");
        assertThat(Mailer.mask("@raro")).isEqualTo("***");
        assertThat(Mailer.mask(null)).isEqualTo("?");
    }
}
