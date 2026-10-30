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

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Mesas y cuentas abiertas (Fase 12b-2, decisión 269): configurar el salón, abrir cuentas, pedir en varios momentos,
 * quitar con motivo, mover, unir, cancelar y cobrar la cuenta completa (se vuelve venta y libera la mesa).
 */
class TablesIT extends IntegrationTest {

    @Test
    void aTableFromOpeningToCharge() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("restaurante");
        Session off = owner.tenant();
        api.getWith(off, "/api/v1/dining/floor").andExpect(status().isForbidden());

        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["CREDIT","ORDERS","QUOTES","MODIFIERS","TABLES"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);

        // Salón: zona con dos mesas (nombre único en la sucursal).
        UUID salon = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Salón\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID mesa4 = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"4\",\"seats\":4}"
                .formatted(salon)).andExpect(status().isCreated()), "$.id");
        UUID mesa5 = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"5\"}"
                .formatted(salon)).andExpect(status().isCreated()), "$.id");
        api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"4\"}".formatted(salon))
                .andExpect(status().isConflict());

        UUID burger = pos.service(s, "HAMB", "18000");
        UUID soda = pos.service(s, "GASEOSA", "4000");

        // Abrir la mesa 4 y pedir en dos momentos.
        String tab = body(api.postWith(s, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\",\"guests\":2}"
                .formatted(mesa4)).andExpect(status().isCreated()).andExpect(jsonPath("$.label").value("Mesa 4")));
        UUID tabId = UUID.fromString(JsonPath.read(tab, "$.id"));
        api.postWith(s, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\"}".formatted(mesa4))
                .andExpect(status().isConflict());
        items(s, tabId, "{\"productId\":\"%s\",\"quantity\":2,\"note\":\"sin cebolla\"}".formatted(burger))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].note").value("sin cebolla"));
        String withSodas = body(items(s, tabId, "{\"productId\":\"%s\",\"quantity\":3}".formatted(soda))
                .andExpect(status().isOk()));
        assertThat(number(withSodas, "$.total")).isEqualByComparingTo("48000");
        UUID sodaLine = UUID.fromString(JsonPath.read(withSodas, "$.items[1].id"));

        // El salón muestra la mesa ocupada con su total.
        api.getWith(s, "/api/v1/dining/floor").andExpect(status().isOk())
                .andExpect(jsonPath("$.zones[0].tables[0].tab.total").value(48000))
                .andExpect(jsonPath("$.zones[0].tables[1].tab").doesNotExist());

        // Un vendedor quita lo que no ha salido a cocina (con motivo), pero no cancela una cuenta con productos.
        Joined seller = api.joinAs(s, owner.tenantId(), "SELLER");
        api.postWith(seller.session(), "/api/v1/tabs/%s/items/%s/void".formatted(tabId, sodaLine), "{\"reason\":\"\"}")
                .andExpect(status().isBadRequest());
        api.postWith(seller.session(), "/api/v1/tabs/%s/items/%s/void".formatted(tabId, sodaLine),
                "{\"reason\":\"El cliente cambió de opinión\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.items[1].voided").value(true))
                .andExpect(jsonPath("$.total").value(36000));
        api.postWith(seller.session(), "/api/v1/tabs/%s/cancel".formatted(tabId), "{\"reason\":\"Se fueron\"}")
                .andExpect(status().isForbidden());

        // Mover a la mesa 5 y unir una cuenta para llevar.
        api.postWith(s, "/api/v1/tabs/%s/move".formatted(tabId), "{\"tableId\":\"%s\"}".formatted(mesa5))
                .andExpect(status().isOk()).andExpect(jsonPath("$.label").value("Mesa 5"));
        UUID takeaway = id(api.postWith(s, "/api/v1/tabs", "{\"kind\":\"TAKEAWAY\",\"customerName\":\"Juan\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.label").value("Para llevar · Juan")), "$.id");
        items(s, takeaway, "{\"productId\":\"%s\",\"quantity\":1}".formatted(soda)).andExpect(status().isOk());
        api.postWith(s, "/api/v1/tabs/%s/merge".formatted(tabId), "{\"fromTabId\":\"%s\"}".formatted(takeaway))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(40000));
        api.getWith(s, "/api/v1/tabs/" + takeaway).andExpect(jsonPath("$.status").value("MERGED"));

        // Un domicilio sin dirección no se abre.
        api.postWith(s, "/api/v1/tabs", "{\"kind\":\"DELIVERY\",\"customerName\":\"Ana\"}").andExpect(status().is(422));

        // Cobrar: sin caja no; con caja se vuelve venta, la mesa queda libre y repetir con la misma clave no duplica.
        String key = key();
        charge(s, tabId, "40000", key).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("Abre la caja")));
        pos.openCash(s, CAJA_1, "0");
        String sale = body(charge(s, tabId, "40000", key).andExpect(status().isCreated()));
        assertThat(number(sale, "$.total")).isEqualByComparingTo("40000");
        assertThat((String) JsonPath.read(sale, "$.notes")).isEqualTo("Mesa 5");
        List<String> notes = JsonPath.read(sale, "$.items[*].note");
        assertThat(notes).contains("sin cebolla");
        String again = body(charge(s, tabId, "40000", key).andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(again, "$.id")).isEqualTo(JsonPath.read(sale, "$.id"));
        charge(s, tabId, "40000", key()).andExpect(status().isConflict());
        api.getWith(s, "/api/v1/tabs/" + tabId).andExpect(jsonPath("$.status").value("CHARGED"))
                .andExpect(jsonPath("$.saleId").value((String) JsonPath.read(sale, "$.id")));
        api.getWith(s, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[1].tab").doesNotExist());

        // Una mesa vacía se cancela con motivo; todo queda en la auditoría.
        UUID empty = id(api.postWith(s, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\"}".formatted(mesa4))
                .andExpect(status().isCreated()), "$.id");
        api.postWith(seller.session(), "/api/v1/tabs/%s/cancel".formatted(empty), "{\"reason\":\"Se equivocó de mesa\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        api.getWith(s, "/api/v1/audit?entity=tab&size=50").andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(11));
    }

    private ResultActions items(Session s, UUID tab, String item) throws Exception {
        return api.postWith(s, "/api/v1/tabs/%s/items".formatted(tab), "{\"items\":[" + item + "]}");
    }

    private ResultActions charge(Session s, UUID tab, String amount, String idempotencyKey) throws Exception {
        return api.postWithHeaders(s, "/api/v1/tabs/%s/charge".formatted(tab), """
                {"payments":[{"paymentMethodId":"%s","amount":%s}],"expectedTotal":%s}
                """.formatted(CASH, amount, amount), "Idempotency-Key", idempotencyKey);
    }
}
