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

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CARD;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.IVA19;
import static com.poshibrido.sales.PosTestSupport.UND;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cartas por piso (decisión 294): la hamburguesa es de la carta del piso 1 (Caja 1) y la margarita de la del piso 2
 * (Caja C2). Una mesa que pide las dos se cobra en dos ventas, una por caja, con el pago repartido en proporción; la
 * propina y el cambio quedan en la venta de la caja que cobra; el tiquete trae las dos partes.
 */
class DiningMenusIT extends IntegrationTest {

    @Test
    void aTabWithBothMenusIsChargedInTwoRegisters() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("cartas");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);
        UUID food = category(s, "Comida rápida");
        UUID cocktails = category(s, "Cócteles");
        UUID burger = product(s, "HAMB", "Hamburguesa", food, "18000");
        UUID margarita = product(s, "MARG", "Margarita", cocktails, "22000");
        UUID caja2 = pos.newRegister(s, branch, "C2");
        UUID salon = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Piso 1\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID mesa = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"1\"}".formatted(salon))
                .andExpect(status().isCreated()), "$.id");

        // Configurar: solo quien maneja las mesas; el mesero solo las ve (para pedir por carta).
        Session waiter = api.joinAs(s, owner.tenantId(), "WAITER").session();
        menu(waiter, branch, "Piso 2", caja2, cocktails).andExpect(status().isForbidden());
        menu(s, branch, "Piso 2", UUID.randomUUID(), cocktails).andExpect(status().isNotFound());
        menu(s, branch, "Piso 1", CAJA_1, food).andExpect(status().isCreated());
        UUID piso2 = id(menu(s, branch, "Piso 2", caja2, cocktails).andExpect(status().isCreated())
                .andExpect(jsonPath("$.cashRegister.name").value("Caja C2"))
                .andExpect(jsonPath("$.categories[0].name").value("Cócteles")), "$.id");
        menu(s, branch, "piso 2", caja2, null).andExpect(status().isConflict());
        api.getWith(waiter, "/api/v1/dining/menus?branchId=" + branch).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        // Con la caja del piso 2 cerrada no se cobra lo de su carta.
        pos.openCash(s, CAJA_1, "0");
        UUID tab = open(s, mesa, burger, margarita);
        charge(s, tab, key(), "40000").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("Caja C2 (de la carta Piso 2) está cerrada")));

        // Se abre; el dueño cobra en la Caja 1: $15.000 con tarjeta (+ $4.000 de propina) y $30.000 en efectivo.
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        UUID session2 = pos.openCash(cashier, caja2, "0");
        String k = key();
        String sale = body(charge(s, tab, k, "40000").andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(sale, "$.cashRegisterId")).isEqualTo(CAJA_1.toString());
        assertThat(number(sale, "$.total")).isEqualByComparingTo("18000");
        assertThat(number(sale, "$.changeAmount")).isEqualByComparingTo("5000");
        assertThat(number(sale, "$.tip.amount")).isEqualByComparingTo("4000");
        assertThat((String) JsonPath.read(sale, "$.splitLabel")).isEqualTo("Piso 1");
        assertThat(JsonPath.<List<Object>>read(sale, "$.together")).hasSize(2);
        assertThat((String) JsonPath.read(sale, "$.together[0].id")).isEqualTo(JsonPath.read(sale, "$.id"));
        assertThat((String) JsonPath.read(sale, "$.together[1].splitLabel")).isEqualTo("Piso 2");
        assertThat((String) JsonPath.read(sale, "$.together[1].cashRegisterId")).isEqualTo(caja2.toString());
        assertThat(number(sale, "$.together[1].total")).isEqualByComparingTo("22000");
        // Cada medio se reparte en proporción (18/40 y 22/40): tarjeta 6.750 + 8.250 y efectivo 11.250 + 13.750 (la
        // propina va aparte y el cambio sale del efectivo de la Caja 1).
        assertThat(number(sale, "$.payments[0].amount")).isEqualByComparingTo("6750");
        assertThat(number(sale, "$.payments[1].amount")).isEqualByComparingTo("11250");
        assertThat(number(sale, "$.payments[1].tendered")).isEqualByComparingTo("16250");
        assertThat(number(sale, "$.together[1].payments[0].amount")).isEqualByComparingTo("8250");
        assertThat((String) JsonPath.read(sale, "$.together[1].payments[0].reference")).isEqualTo("VOUCHER-1");
        assertThat(number(sale, "$.together[1].payments[1].amount")).isEqualByComparingTo("13750");
        api.getWith(s, "/api/v1/tabs/" + tab).andExpect(jsonPath("$.status").value("CHARGED"));

        // Reintentar con la misma clave no cobra otra vez; la otra parte también trae el tiquete completo.
        String again = body(charge(s, tab, k, "40000").andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(again, "$.id")).isEqualTo(JsonPath.read(sale, "$.id"));
        String other = JsonPath.read(sale, "$.together[1].id");
        api.getWith(s, "/api/v1/sales/" + other).andExpect(jsonPath("$.splitLabel").value("Piso 2"))
                .andExpect(jsonPath("$.together[0].splitLabel").value("Piso 1"))
                .andExpect(jsonPath("$.together[1].splitLabel").value("Piso 2"));

        // El cierre de la caja del piso 2 cuenta solo la margarita.
        String report = body(api.getWith(cashier, "/api/v1/cash/sessions/" + session2 + "/report")
                .andExpect(status().isOk()));
        assertThat(JsonPath.<Integer>read(report, "$.salesCount")).isEqualTo(1);
        assertThat(number(report, "$.salesTotal")).isEqualByComparingTo("22000");

        // Una cuenta solo con la carta del piso 2: una sola venta, en la Caja C2, sin partes.
        UUID drinks = open(s, mesa, margarita);
        String single = body(charge(s, drinks, key(), "22000").andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(single, "$.cashRegisterId")).isEqualTo(caja2.toString());
        assertThat((Object) JsonPath.read(single, "$.splitLabel")).isNull();

        // La carta inactiva ya no manda: la margarita vuelve a la caja de quien cobra. Todo queda en la auditoría.
        api.putWith(s, "/api/v1/dining/menus/" + piso2, """
                {"name":"Piso 2","cashRegisterId":"%s","active":false,"categoryIds":["%s"]}""".formatted(caja2, cocktails))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        String own = body(charge(s, open(s, mesa, margarita), key(), "22000").andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(own, "$.cashRegisterId")).isEqualTo(CAJA_1.toString());
        api.getWith(s, "/api/v1/audit?action=DINING_MENU_CREATED").andExpect(jsonPath("$.totalElements").value(2));
    }

    private UUID category(Session s, String name) throws Exception {
        return id(api.postWith(s, "/api/v1/categories", "{\"name\":\"%s\"}".formatted(name))
                .andExpect(status().isCreated()), "$.id");
    }

    private UUID product(Session s, String sku, String name, UUID category, String price) throws Exception {
        return id(api.postWith(s, "/api/v1/products", """
                {"sku":"%s","name":"%s","categoryId":"%s","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":%s,
                 "trackInventory":false}""".formatted(sku, name, category, UND, IVA19, price))
                .andExpect(status().isCreated()), "$.id");
    }

    private ResultActions menu(Session s, UUID branch, String name, UUID register, UUID category) throws Exception {
        return api.postWith(s, "/api/v1/dining/menus", """
                {"branchId":"%s","name":"%s","cashRegisterId":"%s","categoryIds":[%s]}"""
                .formatted(branch, name, register, category == null ? "" : "\"" + category + "\""));
    }

    private UUID open(Session s, UUID table, UUID... products) throws Exception {
        UUID tab = id(api.postWith(s, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\"}".formatted(table))
                .andExpect(status().isCreated()), "$.id");
        StringBuilder items = new StringBuilder();
        for (UUID p : products) {
            items.append(items.isEmpty() ? "" : ",").append("{\"productId\":\"%s\",\"quantity\":1}".formatted(p));
        }
        api.postWith(s, "/api/v1/tabs/%s/items".formatted(tab), "{\"items\":[%s]}".formatted(items))
                .andExpect(status().isOk());
        return tab;
    }

    private ResultActions charge(Session s, UUID tab, String idempotencyKey, String total) throws Exception {
        String payments = "40000".equals(total)
                ? """
                  [{"paymentMethodId":"%s","amount":19000,"reference":"VOUCHER-1"},{"paymentMethodId":"%s","amount":30000}]"""
                  .formatted(CARD, CASH)
                : "[{\"paymentMethodId\":\"%s\",\"amount\":%s}]".formatted(CASH, total);
        String tip = "40000".equals(total) ? ",\"tip\":{\"amount\":4000,\"paymentMethodId\":\"%s\"}".formatted(CARD) : "";
        return api.postWithHeaders(s, "/api/v1/tabs/%s/charge".formatted(tab), """
                {"payments":%s,"expectedTotal":%s%s}""".formatted(payments, total, tip), "Idempotency-Key", idempotencyKey);
    }
}
