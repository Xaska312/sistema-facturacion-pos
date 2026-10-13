package com.poshibrido.identity;

import com.poshibrido.identity.application.LegalConsentService;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Fase 9a (decisión 250): aceptación de los Términos y la Política de datos, con prueba guardada. */
class LegalConsentIT extends IntegrationTest {

    @Test
    void registrationRequiresAcceptingTermsAndPrivacy() throws Exception {
        for (String accept : new String[] {"", ",\"acceptTerms\":false"}) {
            mvc.perform(post("/api/v1/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"email":"%s","password":"%s","fullName":"Sin aceptar"%s}
                                    """.formatted(TestApi.uniqueEmail("legal"), TestApi.PASSWORD, accept)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$..field", hasItem("acceptTerms")));
        }
    }

    @Test
    void registrationKeepsProofAndStatusSaysAccepted() throws Exception {
        String email = TestApi.uniqueEmail("legal");
        UUID userId = api.register(email);
        Session session = api.login(email);

        api.getWith(session, "/api/v1/auth/legal").andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(true))
                .andExpect(jsonPath("$.termsVersion").value(LegalConsentService.TERMS_VERSION))
                .andExpect(jsonPath("$.privacyVersion").value(LegalConsentService.PRIVACY_VERSION));

        var row = jdbc.queryForMap(
                "SELECT terms_version, privacy_version, ip, accepted_at FROM platform.legal_consents WHERE user_id = ?",
                userId);
        assertThat(row.get("terms_version")).isEqualTo(LegalConsentService.TERMS_VERSION);
        assertThat(row.get("ip")).isNotNull();
        assertThat(row.get("accepted_at")).isNotNull();

        // La prueba no se cambia (sí se puede borrar fila por fila, para suprimir una cuenta).
        assertThatThrownBy(() -> jdbc.update(
                "UPDATE platform.legal_consents SET terms_version = '0.9' WHERE user_id = ?", userId))
                .hasMessageContaining("no se modifican");
    }

    @Test
    void accountWithoutCurrentVersionIsAskedAndCanAccept() throws Exception {
        String email = TestApi.uniqueEmail("legal");
        UUID userId = api.register(email);
        // Cuenta creada antes de pedir la aceptación (o con una versión vieja).
        jdbc.update("DELETE FROM platform.legal_consents WHERE user_id = ?", userId);
        Session session = api.login(email);

        api.getWith(session, "/api/v1/auth/legal").andExpect(jsonPath("$.accepted").value(false));
        api.postEmpty(session, "/api/v1/auth/legal/accept").andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(true));
        api.getWith(session, "/api/v1/auth/legal").andExpect(jsonPath("$.accepted").value(true));

        Integer rows = jdbc.queryForObject("SELECT count(*) FROM platform.legal_consents WHERE user_id = ?",
                Integer.class, userId);
        assertThat(rows).isEqualTo(1);
    }

    @Test
    void legalStatusNeedsASession() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/auth/legal"))
                .andExpect(status().isUnauthorized());
    }
}
