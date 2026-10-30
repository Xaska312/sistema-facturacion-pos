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
import static com.poshibrido.sales.PosTestSupport.TRANSFER;
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
 * Cobro de mesas (Fase 12b-5, decisión 272): cobrar por productos (partiendo una línea), la propina aparte con su medio
 * (en efectivo entra a la caja), lo cobrado no se quita ni se cancela, la anulación devuelve la propina, el reparto de
 * propinas en partes iguales y el asistente del impuesto al consumo.
 */
class TabSplitIT extends IntegrationTest {

    @Test
    void payByProductsWithTipsAndShareThem() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("dividir");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        api.getWith(s, "/api/v1/settings").andExpect(jsonPath("$.tipPercent").value(10));
        api.getWith(s, "/api/v1/sales/config").andExpect(jsonPath("$.tipPercent").value(10));

        UUID branch = api.principalBranchId(s);
        UUID burger = pos.service(s, "HAMB", "18000");
        UUID soda = pos.service(s, "GASEOSA", "4000");
        UUID salon = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Salón\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID mesa = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"3\"}"
                .formatted(salon)).andExpect(status().isCreated()), "$.id");
        UUID tab = id(api.postWith(s, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\"}".formatted(mesa))
                .andExpect(status().isCreated()), "$.id");
        String withItems = body(api.postWith(s, "/api/v1/tabs/%s/items".formatted(tab), """
                {"items":[{"productId":"%s","quantity":2},{"productId":"%s","quantity":1}]}""".formatted(burger, soda))
                .andExpect(status().isOk()));
        UUID burgers = UUID.fromString(JsonPath.read(withItems, "$.items[0].id"));
        UUID cashSession = pos.openCash(s, CAJA_1, "0");

        // Una persona paga una de las dos hamburguesas, en efectivo, con propina del 10 % también en efectivo.
        String first = body(charge(s, tab, """
                {"items":[{"itemId":"%s","quantity":1}],"expectedTotal":18000,
                 "payments":[{"paymentMethodId":"%s","amount":25000}],
                 "tip":{"amount":1800,"paymentMethodId":"%s","suggestedPercent":10}}""".formatted(burgers, CASH, CASH),
                key()).andExpect(status().isCreated()));
        assertThat(number(first, "$.total")).isEqualByComparingTo("18000");
        assertThat(number(first, "$.changeAmount")).isEqualByComparingTo("5200");
        assertThat(number(first, "$.tip.amount")).isEqualByComparingTo("1800");
        UUID firstSale = UUID.fromString(JsonPath.read(first, "$.id"));

        // La cuenta sigue abierta con lo que falta; la hamburguesa se partió.
        String open = body(api.getWith(s, "/api/v1/tabs/" + tab).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.total").value(22000))
                .andExpect(jsonPath("$.chargedTotal").value(18000))
                .andExpect(jsonPath("$.items.length()").value(3)));
        List<String> charged = JsonPath.read(open, "$.items[?(@.saleId != null)].id");
        assertThat(charged).hasSize(1);
        api.postWith(s, "/api/v1/tabs/%s/items/%s/void".formatted(tab, charged.getFirst()), "{\"reason\":\"No\"}")
                .andExpect(status().isConflict());
        api.postWith(s, "/api/v1/tabs/%s/cancel".formatted(tab), "{\"reason\":\"Se fueron\"}")
                .andExpect(status().isConflict());
        api.getWith(s, "/api/v1/dining/floor").andExpect(jsonPath("$.zones[0].tables[0].tab.total").value(22000));

        // La propina se paga con uno de los medios de la cuenta.
        charge(s, tab, """
                {"expectedTotal":22000,"payments":[{"paymentMethodId":"%s","amount":24000}],
                 "tip":{"amount":2000,"paymentMethodId":"%s"}}""".formatted(CASH, TRANSFER), key())
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("propina")));

        // Lo demás con tarjeta y propina con tarjeta: la cuenta queda cobrada y la mesa libre.
        charge(s, tab, """
                {"expectedTotal":22000,"payments":[{"paymentMethodId":"%s","amount":24000}],
                 "tip":{"amount":2000,"paymentMethodId":"%s"}}""".formatted(CARD, CARD), key())
                .andExpect(status().isCreated()).andExpect(jsonPath("$.tip.methodName").exists());
        api.getWith(s, "/api/v1/tabs/" + tab).andExpect(jsonPath("$.status").value("CHARGED"))
                .andExpect(jsonPath("$.saleIds.length()").value(2));

        // La caja: la venta en efectivo y la propina en efectivo aparte.
        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + cashSession + "/report").andExpect(status().isOk()));
        assertThat(number(report, "$.cash.sales")).isEqualByComparingTo("18000");
        assertThat(number(report, "$.cash.tips")).isEqualByComparingTo("1800");
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("19800");

        // Propinas: lo recogido y el reparto en partes iguales (desde la caja).
        String summary = body(api.getWith(s, "/api/v1/tips").andExpect(status().isOk())
                .andExpect(jsonPath("$.collected").value(3800))
                .andExpect(jsonPath("$.pending").value(3800)));
        String waiterId = JsonPath.read(body(api.getWith(s, "/api/v1/tips")), "$.people[0].memberId");
        String from = JsonPath.read(summary, "$.from");
        String to = JsonPath.read(summary, "$.to");
        api.postWith(s, "/api/v1/tips/payouts", """
                {"from":"%s","to":"%s","amount":3001,"memberIds":["%s"],"fromCash":true}""".formatted(from, to, waiterId))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.shares[0].amount").value(3001));
        api.postWith(s, "/api/v1/tips/payouts", """
                {"from":"%s","to":"%s","amount":1000,"memberIds":["%s"],"fromCash":false}""".formatted(from, to, waiterId))
                .andExpect(status().is(422));
        api.getWith(s, "/api/v1/tips").andExpect(jsonPath("$.pending").value(799));
        String afterPayout = body(api.getWith(s, "/api/v1/cash/sessions/" + cashSession + "/report"));
        assertThat(number(afterPayout, "$.cash.tipPayouts")).isEqualByComparingTo("-3001");

        // Anular la venta en efectivo devuelve también su propina.
        api.postWith(s, "/api/v1/sales/%s/void".formatted(firstSale), "{\"reason\":\"Error de cobro\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.tip.voided").value(true));
        String afterVoid = body(api.getWith(s, "/api/v1/cash/sessions/" + cashSession + "/report"));
        assertThat(number(afterVoid, "$.cash.tips")).isEqualByComparingTo("0");

        // El mesero no ve las propinas del negocio.
        Session waiter = api.joinAs(s, owner.tenantId(), "WAITER").session();
        api.getWith(waiter, "/api/v1/tips").andExpect(status().isForbidden());

        // Auditoría del reparto.
        api.getWith(s, "/api/v1/audit?action=TIP_PAYOUT_CREATED").andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void consumptionTaxWizardAssignsInc() throws Exception {
        Owned owner = api.newTenant("inc");
        Session s = owner.tenant();
        UUID food = id(api.postWith(s, "/api/v1/categories", "{\"name\":\"Comidas\"}").andExpect(status().isCreated()),
                "$.id");
        UUID burger = id(api.postWith(s, "/api/v1/products", """
                {"sku":"HAMB","name":"Hamburguesa","categoryId":"%s","baseUnitId":"%s","taxId":"%s",
                 "cost":0,"salePrice":18000,"trackInventory":false}""".formatted(food, UND, IVA19))
                .andExpect(status().isCreated()), "$.id");

        String result = body(api.postWith(s, "/api/v1/taxes/consumption", "{\"categoryIds\":[\"%s\"]}".formatted(food))
                .andExpect(status().isOk()).andExpect(jsonPath("$.products").value(1))
                .andExpect(jsonPath("$.taxName").value("INC 8 %")));
        String taxId = JsonPath.read(result, "$.taxId");
        api.getWith(s, "/api/v1/products/" + burger).andExpect(jsonPath("$.taxId").value(taxId));
        // Otra vez no cambia nada y no crea otro impuesto.
        api.postWith(s, "/api/v1/taxes/consumption", "{\"categoryIds\":[\"%s\"]}".formatted(food))
                .andExpect(status().isOk()).andExpect(jsonPath("$.products").value(0))
                .andExpect(jsonPath("$.taxId").value(taxId));
        api.getWith(s, "/api/v1/audit?action=CONSUMPTION_TAX_APPLIED").andExpect(jsonPath("$.totalElements").value(2));
    }

    private ResultActions charge(Session s, UUID tab, String json, String idempotencyKey) throws Exception {
        return api.postWithHeaders(s, "/api/v1/tabs/%s/charge".formatted(tab), json, "Idempotency-Key", idempotencyKey);
    }
}
