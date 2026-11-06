package com.poshibrido.dining.api;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Avisos en tiempo real (decisiones 277 y 291; hallazgo 1 de la decisión 276): cada persona tiene como máximo 10
 * conexiones abiertas por negocio; la que sobra cierra la más vieja avisándole REPLACED (para que no se reconecte sola),
 * la misma pestaña se reemplaza a sí misma sin sacar a nadie y al desactivar a alguien se cierran todas.
 */
class DiningEventsLimitIT extends IntegrationTest {

    @Autowired
    private DiningEventsController controller;

    @Test
    void connectionsAreCappedPerUserAndClosedOnDeactivation() throws Exception {
        Owned owner = api.newTenant("avisos");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        Joined waiter = api.joinAs(s, owner.tenantId(), "WAITER");

        for (int i = 0; i < 12; i++) {
            open(waiter.session(), null);
        }
        open(s, null);
        assertThat(controller.openFor(owner.tenantId(), waiter.userId())).isEqualTo(DiningEventsController.MAX_PER_USER);
        assertThat(controller.openFor(owner.tenantId(), owner.ownerId())).isEqualTo(1);

        api.postEmpty(s, "/api/v1/members/%s/deactivate".formatted(waiter.userId())).andExpect(status().isOk());
        assertThat(controller.openFor(owner.tenantId(), waiter.userId())).isZero();
        assertThat(controller.openFor(owner.tenantId(), owner.ownerId())).isEqualTo(1);
    }

    @Test
    void theOldestScreenIsToldItWasReplacedAndTheSameTabReplacesItselfSilently() throws Exception {
        Owned owner = api.newTenant("avisos-reemplazo");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        Joined cook = api.joinAs(s, owner.tenantId(), "WAITER");

        // La misma pestaña se reconecta muchas veces (renovación del token, cierre de cada 10 min): ocupa un solo lugar.
        MvcResult first = open(cook.session(), "pestana-cocina-1");
        for (int i = 0; i < 15; i++) {
            open(cook.session(), "pestana-cocina-1");
        }
        assertThat(controller.openFor(owner.tenantId(), cook.userId())).isEqualTo(1);
        assertThat(first.getResponse().getContentAsString()).doesNotContain("REPLACED");

        // Diez pantallas más: la más vieja (la pestaña de cocina) recibe REPLACED y queda por fuera.
        MvcResult oldest = open(cook.session(), "pestana-cocina-1");
        for (int i = 0; i < DiningEventsController.MAX_PER_USER; i++) {
            open(cook.session(), "pantalla-" + i + "-abcdef");
        }
        assertThat(controller.openFor(owner.tenantId(), cook.userId())).isEqualTo(DiningEventsController.MAX_PER_USER);
        assertThat(oldest.getResponse().getContentAsString()).contains("event:REPLACED");

        // Un identificador raro se ignora (cuenta como pantalla sin identificador).
        open(cook.session(), "<script>");
        assertThat(controller.openFor(owner.tenantId(), cook.userId())).isEqualTo(DiningEventsController.MAX_PER_USER);
    }

    private MvcResult open(Session session, String client) throws Exception {
        var request = get("/api/v1/dining/events").header(HttpHeaders.AUTHORIZATION, session.bearer());
        if (client != null) {
            request = request.param("client", client);
        }
        return mvc.perform(request).andExpect(request().asyncStarted()).andReturn();
    }
}
