package com.poshibrido.dining;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pantalla de cocina (Fase 12b-4, decisión 271): el rol Cocina ve lo pendiente y lo mueve Nueva → Preparando → Lista;
 * el mesero solo marca Entregada lo que está Listo; el salón muestra la mesa con platos listos; una anulación de algo
 * ya enviado deja un aviso por imprimir; los avisos en tiempo real se abren como flujo de eventos.
 */
class KitchenDisplayIT extends IntegrationTest {

    @Test
    void theKitchenMovesTicketsAndTheWaiterDelivers() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("pantalla");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES","KITCHEN"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);
        UUID burger = pos.service(s, "HAMB", "18000");
        UUID salon = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Salón\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID mesa = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"7\"}"
                .formatted(salon)).andExpect(status().isCreated()), "$.id");

        Session waiter = api.joinAs(s, owner.tenantId(), "WAITER").session();
        Session cook = api.joinAs(s, owner.tenantId(), "COOK").session();

        // Avisos en tiempo real: el mesero y la cocina abren el flujo.
        api.getWith(waiter, "/api/v1/dining/events").andExpect(request().asyncStarted());
        api.getWith(cook, "/api/v1/dining/events").andExpect(request().asyncStarted());

        UUID tab = id(api.postWith(waiter, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\"}".formatted(mesa))
                .andExpect(status().isCreated()), "$.id");
        String sent = body(api.postWith(waiter, "/api/v1/tabs/%s/items".formatted(tab),
                "{\"send\":true,\"items\":[{\"productId\":\"%s\",\"quantity\":2}]}".formatted(burger))
                .andExpect(status().isOk()).andExpect(jsonPath("$.tickets[0].status").value("NEW")));
        UUID ticket = UUID.fromString(JsonPath.read(sent, "$.tickets[0].id"));
        UUID line = UUID.fromString(JsonPath.read(sent, "$.items[0].id"));

        // La cocina ve la comanda; no ve el salón ni las ventas.
        api.getWith(cook, "/api/v1/kitchen/board").andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].tabLabel").value("Mesa 7"))
                .andExpect(jsonPath("$[0].status").value("NEW"));
        api.getWith(cook, "/api/v1/dining/floor").andExpect(status().isForbidden());
        api.getWith(cook, "/api/v1/sales").andExpect(status().isForbidden());

        // El mesero no mueve la comanda en la cocina; la cocina sí, y no se salta de Nueva a Entregada.
        move(waiter, ticket, "PREPARING").andExpect(status().isForbidden());
        move(cook, ticket, "DELIVERED").andExpect(status().is(422));
        move(cook, ticket, "PREPARING").andExpect(status().isOk()).andExpect(jsonPath("$.preparingAt").exists());
        move(cook, ticket, "READY").andExpect(status().isOk()).andExpect(jsonPath("$.readyAt").exists());

        // El salón muestra la mesa con un plato listo; la cuenta, la comanda Lista.
        api.getWith(waiter, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[0].tab.ready").value(1));
        api.getWith(waiter, "/api/v1/tabs/" + tab).andExpect(jsonPath("$.tickets[0].status").value("READY"));

        // El mesero la entrega y sale de la pantalla de cocina.
        move(waiter, ticket, "DELIVERED").andExpect(status().isOk());
        api.getWith(cook, "/api/v1/kitchen/board").andExpect(jsonPath("$.length()").value(0));
        api.getWith(waiter, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[0].tab.ready").value(0));

        // Anular algo ya enviado deja un aviso de anulación por imprimir (no aparece en la pantalla).
        api.postWith(s, "/api/v1/tabs/%s/items/%s/void".formatted(tab, line), "{\"reason\":\"Se demoró mucho\"}")
                .andExpect(status().isOk());
        String pending = body(api.getWith(cook, "/api/v1/kitchen/tickets?pending=true").andExpect(status().isOk()));
        List<String> types = JsonPath.read(pending, "$[*].type");
        assertThat(types).containsExactly("ORDER", "VOID");
        assertThat((Integer) JsonPath.read(pending, "$[1].voidOfNumber")).isEqualTo(JsonPath.read(sent,
                "$.tickets[0].number"));
        assertThat((Boolean) JsonPath.read(pending, "$[1].items[0].voided")).isTrue();
        UUID notice = UUID.fromString(JsonPath.read(pending, "$[1].id"));
        move(cook, notice, "READY").andExpect(status().isConflict());
        api.postWith(cook, "/api/v1/kitchen/tickets/%s/print".formatted(notice), "{\"auto\":true}")
                .andExpect(status().isOk());

        // Todo queda en la auditoría.
        String audit = body(api.getWith(s, "/api/v1/audit?size=100&action=KITCHEN_TICKET_STATUS").andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(audit, "$.totalElements")).isEqualTo(3);
    }

    private ResultActions move(Session session, UUID ticket, String to) throws Exception {
        return api.postWith(session, "/api/v1/kitchen/tickets/%s/status".formatted(ticket),
                "{\"status\":\"" + to + "\"}");
    }
}
