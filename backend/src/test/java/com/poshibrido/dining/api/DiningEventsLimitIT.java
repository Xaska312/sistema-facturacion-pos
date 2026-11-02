package com.poshibrido.dining.api;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Avisos en tiempo real (decisión 277; hallazgo 1 de la decisión 276): cada persona tiene como máximo 5 conexiones
 * abiertas por negocio (la sexta cierra la más vieja) y al desactivarla se cierran todas.
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

        for (int i = 0; i < 8; i++) {
            open(waiter.session());
        }
        open(s);
        assertThat(controller.openFor(owner.tenantId(), waiter.userId())).isEqualTo(DiningEventsController.MAX_PER_USER);
        assertThat(controller.openFor(owner.tenantId(), owner.ownerId())).isEqualTo(1);

        api.postEmpty(s, "/api/v1/members/%s/deactivate".formatted(waiter.userId())).andExpect(status().isOk());
        assertThat(controller.openFor(owner.tenantId(), waiter.userId())).isZero();
        assertThat(controller.openFor(owner.tenantId(), owner.ownerId())).isEqualTo(1);
    }

    private void open(Session session) throws Exception {
        mvc.perform(get("/api/v1/dining/events").header(HttpHeaders.AUTHORIZATION, session.bearer()))
                .andExpect(request().asyncStarted());
    }
}
