package com.poshibrido.dining;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Mapa de mesas (decisión 284): el plano guarda lugar, tamaño y forma de cada mesa; cada cuenta trae su estado
 * (pidiendo → en cocina → lista → comiendo → pidió la cuenta); el mesero marca entregada una comanda que la cocina no
 * marcó lista; pedir algo más desmarca "pidió la cuenta".
 */
class TableMapIT extends IntegrationTest {

    @Test
    void layoutAndStatesFollowTheTable() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("mapa");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES","KITCHEN"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);
        UUID burger = pos.service(s, "HAMB", "18000");
        UUID salon = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Salón\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID m1 = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"1\"}".formatted(salon))
                .andExpect(status().isCreated()), "$.id");
        UUID m2 = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"2\"}".formatted(salon))
                .andExpect(status().isCreated()), "$.id");
        UUID terraza = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Terraza\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");

        // Plano: sin ubicar al crear; se guarda dentro de los bordes; la forma redonda es igual de ancha que alta.
        api.getWith(s, "/api/v1/dining/zones?branchId=" + branch)
                .andExpect(jsonPath("$[0].tables[0].map.x").doesNotExist());
        api.putWith(s, "/api/v1/dining/zones/%s/layout".formatted(salon), """
                {"tables":[{"tableId":"%s","x":10,"y":5,"w":14,"h":14,"shape":"ROUND"},
                           {"tableId":"%s","x":95,"y":90,"w":20,"h":10,"shape":"RECT"}]}""".formatted(m1, m2))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tables[0].map.shape").value("ROUND"))
                .andExpect(jsonPath("$.tables[1].map.x").value(80))
                .andExpect(jsonPath("$.tables[1].map.y").value(60));
        api.putWith(s, "/api/v1/dining/zones/%s/layout".formatted(terraza), """
                {"tables":[{"tableId":"%s","x":1,"y":1}]}""".formatted(m1)).andExpect(status().is(422));
        api.putWith(s, "/api/v1/dining/zones/%s/layout".formatted(salon), """
                {"tables":[{"tableId":"%s","x":1,"y":1,"shape":"STAR"}]}""".formatted(m1)).andExpect(status().is(422));
        Session waiter = api.joinAs(s, owner.tenantId(), "WAITER").session();
        api.putWith(waiter, "/api/v1/dining/zones/%s/layout".formatted(salon), "{\"tables\":[]}")
                .andExpect(status().isForbidden());
        api.getWith(waiter, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[0].map.x").value(10));

        // Estados: abierta sin pedir → en cocina → (el mesero la entrega aunque la cocina no la marcó lista) comiendo.
        UUID tab = id(api.postWith(waiter, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\"}".formatted(m1))
                .andExpect(status().isCreated()), "$.id");
        api.getWith(waiter, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[0].tab.state").value("ORDERING"));
        String sent = body(api.postWith(waiter, "/api/v1/tabs/%s/items".formatted(tab),
                "{\"send\":true,\"items\":[{\"productId\":\"%s\",\"quantity\":1}]}".formatted(burger))
                .andExpect(status().isOk()));
        UUID ticket = UUID.fromString(JsonPath.read(sent, "$.tickets[0].id"));
        api.getWith(waiter, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[0].tab.state").value("KITCHEN"));
        api.postWith(waiter, "/api/v1/kitchen/tickets/%s/status".formatted(ticket), "{\"status\":\"DELIVERED\"}")
                .andExpect(status().isOk());
        api.getWith(waiter, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[0].tab.state").value("EATING"));

        // Pidió la cuenta → rojo; si pide algo más, se desmarca.
        api.postWith(waiter, "/api/v1/tabs/%s/bill-request".formatted(tab), "{\"requested\":true}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.billRequestedAt").exists());
        api.getWith(waiter, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[0].tab.state").value("BILL"));
        api.postWith(waiter, "/api/v1/tabs/%s/items".formatted(tab),
                "{\"send\":false,\"items\":[{\"productId\":\"%s\",\"quantity\":1}]}".formatted(burger))
                .andExpect(status().isOk()).andExpect(jsonPath("$.billRequestedAt").doesNotExist());
        api.getWith(waiter, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[0].tab.state").value("EATING"));
        api.getWith(s, "/api/v1/audit?action=TAB_BILL_REQUESTED").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/audit?action=DINING_LAYOUT_UPDATED").andExpect(jsonPath("$.totalElements").value(1));
    }
}
