package com.poshibrido.dining;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Caja por zona (decisión 285): dos pisos, cada uno con su caja. Una mesa del segundo piso queda en la caja del segundo
 * piso aunque la cobren en la del primero; sin caja en la zona, como siempre (la de quien cobra).
 */
class ZoneCashRegisterIT extends IntegrationTest {

    @Test
    void aTableIsChargedInTheRegisterOfItsZone() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("pisos");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);
        UUID burger = pos.service(s, "HAMB", "18000");
        UUID caja2 = pos.newRegister(s, branch, "C2");
        UUID piso1 = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Piso 1\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID piso2 = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Piso 2\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID mesa1 = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"1\"}".formatted(piso1))
                .andExpect(status().isCreated()), "$.id");
        UUID mesa21 = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"21\"}".formatted(piso2))
                .andExpect(status().isCreated()), "$.id");

        // Configurar: solo quien maneja las mesas; la caja debe ser de la sucursal y estar activa.
        api.getWith(s, "/api/v1/dining/registers?branchId=" + branch).andExpect(jsonPath("$.length()").value(2));
        Session waiter = api.joinAs(s, owner.tenantId(), "WAITER").session();
        api.putWith(waiter, "/api/v1/dining/zones/%s/cash-register".formatted(piso2),
                "{\"cashRegisterId\":\"%s\"}".formatted(caja2)).andExpect(status().isForbidden());
        api.putWith(s, "/api/v1/dining/zones/%s/cash-register".formatted(piso2),
                "{\"cashRegisterId\":\"%s\"}".formatted(UUID.randomUUID())).andExpect(status().isNotFound());
        api.putWith(s, "/api/v1/dining/zones/%s/cash-register".formatted(piso2),
                "{\"cashRegisterId\":\"%s\"}".formatted(caja2))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cashRegister.name").value("Caja C2"))
                .andExpect(jsonPath("$.cashRegister.open").value(false));
        api.getWith(waiter, "/api/v1/dining/floor")
                .andExpect(jsonPath("$.zones[0].cashRegister").doesNotExist())
                .andExpect(jsonPath("$.zones[1].cashRegister.name").value("Caja C2"));

        // La caja 1 abierta (la del dueño); la del piso 2 cerrada: la mesa 21 no se puede cobrar todavía.
        UUID session1 = pos.openCash(s, CAJA_1, "0");
        UUID tab21 = openWithBurger(s, mesa21, burger);
        api.getWith(s, "/api/v1/tabs/" + tab21).andExpect(jsonPath("$.chargeRegister.name").value("Caja C2"))
                .andExpect(jsonPath("$.chargeRegister.open").value(false));
        charge(s, tab21, key()).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("Caja C2 (de la zona Piso 2) está cerrada")));

        // El cajero del piso 2 abre su caja; el dueño cobra desde la caja 1 y la venta queda en la del piso 2.
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        UUID session2 = pos.openCash(cashier, caja2, "0");
        String sale21 = body(charge(s, tab21, key()).andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(sale21, "$.cashSessionId")).isEqualTo(session2.toString());
        assertThat((String) JsonPath.read(sale21, "$.cashRegisterId")).isEqualTo(caja2.toString());

        // Una mesa del piso 1 (sin caja propia) queda en la caja de quien cobra.
        UUID tab1 = openWithBurger(s, mesa1, burger);
        api.getWith(s, "/api/v1/tabs/" + tab1).andExpect(jsonPath("$.chargeRegister").doesNotExist());
        String sale1 = body(charge(s, tab1, key()).andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(sale1, "$.cashSessionId")).isEqualTo(session1.toString());

        // El cierre de la caja del piso 2 cuenta esa venta (el efectivo lo recibió la caja 1: se cuadra entre las dos).
        String report = body(api.getWith(cashier, "/api/v1/cash/sessions/" + session2 + "/report")
                .andExpect(status().isOk()));
        assertThat(JsonPath.<Integer>read(report, "$.salesCount")).isEqualTo(1);
        assertThat(PosTestSupport.number(report, "$.salesTotal")).isEqualByComparingTo("18000");

        // Quitarle la caja a la zona: vuelve a la caja de quien cobra. Todo queda en la auditoría.
        api.putWith(s, "/api/v1/dining/zones/%s/cash-register".formatted(piso2), "{\"cashRegisterId\":null}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.cashRegister").doesNotExist());
        UUID again = openWithBurger(s, mesa21, burger);
        String sale = body(charge(s, again, key()).andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(sale, "$.cashSessionId")).isEqualTo(session1.toString());
        api.getWith(s, "/api/v1/audit?action=DINING_ZONE_CASH_REGISTER_UPDATED")
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    private UUID openWithBurger(Session s, UUID table, UUID burger) throws Exception {
        UUID tab = id(api.postWith(s, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\"}".formatted(table))
                .andExpect(status().isCreated()), "$.id");
        api.postWith(s, "/api/v1/tabs/%s/items".formatted(tab),
                "{\"items\":[{\"productId\":\"%s\",\"quantity\":1}]}".formatted(burger)).andExpect(status().isOk());
        return tab;
    }

    private ResultActions charge(Session s, UUID tab, String idempotencyKey) throws Exception {
        return api.postWithHeaders(s, "/api/v1/tabs/%s/charge".formatted(tab), """
                {"payments":[{"paymentMethodId":"%s","amount":18000}],"expectedTotal":18000}
                """.formatted(CASH), "Idempotency-Key", idempotencyKey);
    }
}
