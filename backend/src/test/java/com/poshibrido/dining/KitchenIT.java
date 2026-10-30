package com.poshibrido.dining;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cocina y comandas (Fase 12b-3, decisión 270): estaciones, el mesero pide y envía en un paso (una comanda por
 * estación, el término destacado), lo que salió a cocina no lo quita el mesero, la primera impresión la reclama un solo
 * equipo y reimprimir queda en la auditoría.
 */
class KitchenIT extends IntegrationTest {

    @Test
    void theWaiterSendsAndTheKitchenPrints() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("cocina");
        Session off = owner.tenant();

        // Cocina sin Mesas no se puede encender.
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["MODIFIERS","KITCHEN"]}
                """).andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("necesita Mesas")));
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["MODIFIERS","TABLES","KITCHEN"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);

        // La estación principal ya existe; se crea el Bar con la gaseosa.
        UUID burger = pos.service(s, "HAMB", "18000");
        UUID soda = pos.service(s, "GASEOSA", "4000");
        String stations = body(api.getWith(s, "/api/v1/kitchen/stations").andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Cocina"))
                .andExpect(jsonPath("$[0].main").value(true)));
        UUID cocina = UUID.fromString(JsonPath.read(stations, "$[0].id"));
        api.postWith(s, "/api/v1/kitchen/stations", "{\"name\":\"Bar\",\"productIds\":[\"%s\"]}".formatted(soda))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.products[0].id").value(soda.toString()));
        api.postWith(s, "/api/v1/kitchen/stations", "{\"name\":\"bar\"}").andExpect(status().isConflict());
        api.putWith(s, "/api/v1/kitchen/stations/" + cocina, "{\"name\":\"Cocina\",\"main\":false}")
                .andExpect(status().is(422));

        // Término de la carne: grupo obligatorio de una sola opción.
        String term = body(api.postWith(s, "/api/v1/modifier-groups", """
                {"name":"Término","minSelect":1,"maxSelect":1,"productIds":["%s"],"categoryIds":[],
                 "options":[{"name":"Medio","priceDelta":0},{"name":"Bien asado","priceDelta":0}]}
                """.formatted(burger)).andExpect(status().isCreated()));
        UUID medio = UUID.fromString(JsonPath.read(term, "$.options[0].id"));

        UUID salon = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Salón\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID mesa1 = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"1\"}"
                .formatted(salon)).andExpect(status().isCreated()), "$.id");

        // El mesero abre la mesa y envía en un paso: una comanda para Cocina y otra para el Bar.
        Joined waiter = api.joinAs(s, owner.tenantId(), "WAITER");
        Session w = waiter.session();
        UUID tab = id(api.postWith(w, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\"}".formatted(mesa1))
                .andExpect(status().isCreated()), "$.id");
        String sent = body(items(w, tab, true, """
                {"productId":"%s","quantity":1,"modifiers":[{"optionId":"%s"}],"note":"sin cebolla"}""".formatted(burger, medio),
                "{\"productId\":\"%s\",\"quantity\":2}".formatted(soda)).andExpect(status().isOk())
                .andExpect(jsonPath("$.tickets.length()").value(2))
                .andExpect(jsonPath("$.tickets[0].stationName").value("Cocina"))
                .andExpect(jsonPath("$.tickets[1].stationName").value("Bar"))
                .andExpect(jsonPath("$.items[0].stationName").value("Cocina"))
                .andExpect(jsonPath("$.items[1].stationName").value("Bar")));
        UUID burgerLine = UUID.fromString(JsonPath.read(sent, "$.items[0].id"));

        // Lo que ya salió a cocina no lo quita el mesero.
        api.postWith(w, "/api/v1/tabs/%s/items/%s/void".formatted(tab, burgerLine), "{\"reason\":\"No lo quiso\"}")
                .andExpect(status().isForbidden());

        // Agregado sin enviar: se envía después; sin nada pendiente no hay qué enviar.
        items(w, tab, false, "{\"productId\":\"%s\",\"quantity\":1}".formatted(soda)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[2].sentAt").doesNotExist());
        api.postEmpty(w, "/api/v1/tabs/%s/send".formatted(tab)).andExpect(status().isOk())
                .andExpect(jsonPath("$.tickets.length()").value(3));
        api.postEmpty(w, "/api/v1/tabs/%s/send".formatted(tab)).andExpect(status().is(422));

        // La impresora automática ve las tres sin imprimir, en orden; el término sale destacado.
        String pending = body(api.getWith(w, "/api/v1/kitchen/tickets?pending=true").andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].stationName").value("Cocina"))
                .andExpect(jsonPath("$[0].tabLabel").value("Mesa 1"))
                .andExpect(jsonPath("$[0].items[0].note").value("sin cebolla"))
                .andExpect(jsonPath("$[0].items[0].modifiers[0].name").value("Medio"))
                .andExpect(jsonPath("$[0].items[0].modifiers[0].highlight").value(true)));
        UUID first = UUID.fromString(JsonPath.read(pending, "$[0].id"));
        api.getWith(w, "/api/v1/kitchen/tickets?pending=true&stationId=" + cocina)
                .andExpect(jsonPath("$.length()").value(1));

        // La primera impresión la reclama un equipo; otro no la vuelve a sacar; reimprimir a mano sí.
        api.postWith(w, "/api/v1/kitchen/tickets/%s/print".formatted(first), "{\"auto\":true}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.printCount").value(1));
        api.postWith(w, "/api/v1/kitchen/tickets/%s/print".formatted(first), "{\"auto\":true}")
                .andExpect(status().isConflict());
        api.postWith(w, "/api/v1/kitchen/tickets/%s/print".formatted(first), "{}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.printCount").value(2));
        api.getWith(w, "/api/v1/kitchen/tickets?pending=true").andExpect(jsonPath("$.length()").value(2));

        // El mesero no configura estaciones; caja anula lo que ya salió.
        api.postWith(w, "/api/v1/kitchen/stations", "{\"name\":\"Parrilla\"}").andExpect(status().isForbidden());
        api.postWith(s, "/api/v1/tabs/%s/items/%s/void".formatted(tab, burgerLine), "{\"reason\":\"No lo quiso\"}")
                .andExpect(status().isOk());
        api.getWith(s, "/api/v1/kitchen/tickets/" + first).andExpect(jsonPath("$.items[0].voided").value(true));

        // El mesero ve sus ventas del día.
        api.getWith(w, "/api/v1/reports/my-day").andExpect(status().isOk());

        // Auditoría: envíos y reimpresión.
        String audit = body(api.getWith(s, "/api/v1/audit?size=100").andExpect(status().isOk()));
        List<String> actions = JsonPath.read(audit, "$.content[*].action");
        assertThat(actions).contains("KITCHEN_STATION_CREATED", "KITCHEN_SENT", "KITCHEN_TICKET_REPRINTED");
        assertThat(actions.stream().filter("KITCHEN_SENT"::equals)).hasSize(2);

        // Con la cocina apagada se sigue atendiendo, pero no se envía.
        api.putWith(s, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["MODIFIERS","TABLES"]}
                """).andExpect(status().isOk());
        Session w2 = TestApi.session(api.refreshRaw(w.refreshToken()).andExpect(status().isOk()).andReturn());
        items(w2, tab, true, "{\"productId\":\"%s\",\"quantity\":1}".formatted(soda)).andExpect(status().is(422));
        items(w2, tab, false, "{\"productId\":\"%s\",\"quantity\":1}".formatted(soda)).andExpect(status().isOk());
        api.getWith(w2, "/api/v1/kitchen/tickets").andExpect(status().isForbidden());
    }

    private ResultActions items(Session s, UUID tab, boolean send, String... items) throws Exception {
        return api.postWith(s, "/api/v1/tabs/%s/items".formatted(tab),
                "{\"send\":" + send + ",\"items\":[" + String.join(",", items) + "]}");
    }
}
