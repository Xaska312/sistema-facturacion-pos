package com.poshibrido.quotes;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
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

/** Cotizaciones: prospectos, descuentos, vigencia, conversión en pedido y en venta, permisos (decisión 260). */
class QuotesIT extends IntegrationTest {

    static final UUID M2 = UUID.fromString("01920000-0000-7000-8000-000000000311");

    private PosTestSupport pos;

    @BeforeEach
    void setUpPos() {
        pos = new PosTestSupport(api);
    }

    @Test
    void prospectQuoteBecomesAnOrderWithNetPrices() throws Exception {
        Owned owner = api.newTenant("cotizaciones");
        Session s = owner.tenant();
        UUID granite = product(s, "GRANITO", "Granito negro", M2, "300000");
        UUID install = product(s, "INST", "Instalación", UND, "150000");

        // Ajustes: la vigencia por defecto llega a la pantalla sin permiso de Ajustes
        api.getWith(s, "/api/v1/quotes/config").andExpect(jsonPath("$.validityDays").value(15))
                .andExpect(jsonPath("$.businessName").isNotEmpty());
        api.putWith(s, "/api/v1/settings", """
                {"allowNegativeStock":false,"pricesIncludeTax":true,"timezone":"America/Bogota","currency":"COP",
                 "maxDiscountPercent":0,"quoteValidityDays":30,"quoteTerms":"Anticipo del 50 %."}
                """).andExpect(status().isOk());
        api.getWith(s, "/api/v1/quotes/config").andExpect(jsonPath("$.validityDays").value(30))
                .andExpect(jsonPath("$.terms").value("Anticipo del 50 %."));

        // Sin cliente ni nombre: 422. Al prospecto se le cotiza con nombre y teléfono.
        api.postWith(s, "/api/v1/quotes", """
                {"items":[{"productId":"%s","quantity":1,"unitPrice":150000}]}""".formatted(install))
                .andExpect(status().is(422));
        String created = body(api.postWith(s, "/api/v1/quotes", """
                {"prospectName":"Marta Gómez","prospectPhone":"3001234567","notes":"Cocina integral",
                 "items":[{"productId":"%s","description":"Mesón cocina","width":2.4,"length":0.6,"unitPrice":300000,
                           "discountPercent":10},
                          {"productId":"%s","quantity":1,"unitPrice":150000}]}
                """.formatted(granite, install)).andExpect(status().isCreated()));
        UUID quote = UUID.fromString(JsonPath.read(created, "$.id"));
        assertThat((String) JsonPath.read(created, "$.number")).isEqualTo("COT-1");
        assertThat((String) JsonPath.read(created, "$.status")).isEqualTo("OPEN");
        assertThat((String) JsonPath.read(created, "$.terms")).isEqualTo("Anticipo del 50 %.");
        assertThat((String) JsonPath.read(created, "$.validUntil")).isEqualTo(today().plusDays(30).toString());
        // 1,44 m² × 300.000 − 10 % = 388.800; más la instalación 150.000
        assertThat(number(created, "$.items[0].quantity")).isEqualByComparingTo("1.44");
        assertThat(number(created, "$.total")).isEqualByComparingTo("538800");

        api.getWith(s, "/api/v1/quotes?search=marta").andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].partyName").value("Marta Gómez"));
        api.getWith(s, "/api/v1/quotes?search=COT-1").andExpect(jsonPath("$.totalElements").value(1));

        // La fecha de validez no puede quedar en el pasado
        api.putWith(s, "/api/v1/quotes/" + quote, """
                {"prospectName":"Marta Gómez","validUntil":"%s",
                 "items":[{"productId":"%s","quantity":1,"unitPrice":150000}]}
                """.formatted(today().minusDays(1), install)).andExpect(status().is(422));

        // A pedido: el prospecto debe registrarse; el pedido lleva el precio neto de descuento y las medidas
        api.postWith(s, "/api/v1/quotes/" + quote + "/order", """
                {"dueDate":"%s"}""".formatted(today().plusDays(10))).andExpect(status().is(422));
        UUID marta = customer(s, "7001", "Marta", "Gómez");
        String accepted = body(api.postWith(s, "/api/v1/quotes/" + quote + "/order", """
                {"customerId":"%s","dueDate":"%s","address":"Calle 5 # 3-10"}
                """.formatted(marta, today().plusDays(10))).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(accepted, "$.status")).isEqualTo("ACCEPTED");
        assertThat((String) JsonPath.read(accepted, "$.convertedType")).isEqualTo("ORDER");
        assertThat((String) JsonPath.read(accepted, "$.convertedNumber")).isEqualTo("PED-1");
        assertThat((String) JsonPath.read(accepted, "$.customerId")).isEqualTo(marta.toString());
        String orderId = JsonPath.read(accepted, "$.convertedId");
        String order = body(api.getWith(s, "/api/v1/orders/" + orderId).andExpect(status().isOk()));
        assertThat(number(order, "$.items[0].unitPrice")).isEqualByComparingTo("270000");
        assertThat(number(order, "$.items[0].width")).isEqualByComparingTo("2.4");
        assertThat(number(order, "$.total")).isEqualByComparingTo("538800");
        assertThat((String) JsonPath.read(order, "$.notes")).isEqualTo("Cocina integral");

        // Ya aceptada: no se convierte ni se edita otra vez
        api.postWith(s, "/api/v1/quotes/" + quote + "/order", """
                {"customerId":"%s","dueDate":"%s"}""".formatted(marta, today().plusDays(10)))
                .andExpect(status().isConflict());
        api.postWith(s, "/api/v1/quotes/" + quote + "/reject", "{\"reason\":\"x\"}")
                .andExpect(status().isConflict());
        api.getWith(s, "/api/v1/quotes?filter=ACCEPTED").andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void quoteIsSoldWithQuotedPricesAndExpires() throws Exception {
        Owned owner = api.newTenant("cotizaciones-venta");
        Session s = owner.tenant();
        UUID paper = product(s, "RESMA", "Resma carta", UND, "20000");
        UUID ana = customer(s, "7002", "Ana", "Ruiz");

        // Precio especial y 5 % de descuento: 10 × 18.000 − 5 % = 171.000
        String created = body(api.postWith(s, "/api/v1/quotes", """
                {"customerId":"%s","items":[{"productId":"%s","description":"Para el colegio","quantity":10,
                 "unitPrice":18000,"discountPercent":5}]}""".formatted(ana, paper)).andExpect(status().isCreated()));
        UUID quote = UUID.fromString(JsonPath.read(created, "$.id"));
        assertThat(number(created, "$.total")).isEqualByComparingTo("171000");

        // Sin caja no se vende; con caja, efectivo con cambio y la misma clave no vende dos veces
        String saleKey = key();
        sell(s, quote, "200000", saleKey).andExpect(status().is(422));
        pos.openCash(s, CAJA_1, "0");
        String sold = body(sell(s, quote, "200000", saleKey).andExpect(status().isOk()));
        UUID saleId = UUID.fromString(JsonPath.read(sold, "$.saleId"));
        assertThat((String) JsonPath.read(sold, "$.quote.status")).isEqualTo("ACCEPTED");
        assertThat((String) JsonPath.read(sold, "$.quote.convertedType")).isEqualTo("SALE");
        String again = body(sell(s, quote, "200000", saleKey).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(again, "$.saleId")).isEqualTo(saleId.toString());
        String sale = body(api.getWith(s, "/api/v1/sales/" + saleId).andExpect(status().isOk()));
        assertThat(number(sale, "$.total")).isEqualByComparingTo("171000");
        assertThat(number(sale, "$.changeAmount")).isEqualByComparingTo("29000");
        assertThat((String) JsonPath.read(sale, "$.items[0].name")).contains("Para el colegio");
        assertThat((String) JsonPath.read(sale, "$.customerName")).contains("Ana");

        // Una vencida no se vende hasta renovarla; se puede rechazar
        UUID old = id(api.postWith(s, "/api/v1/quotes", """
                {"customerId":"%s","items":[{"productId":"%s","quantity":1,"unitPrice":20000}]}
                """.formatted(ana, paper)).andExpect(status().isCreated()), "$.id");
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        jdbc.update("UPDATE " + schema + ".quotes SET valid_until = valid_until - 40 WHERE id = ?", old);
        api.getWith(s, "/api/v1/quotes/" + old).andExpect(jsonPath("$.expired").value(true));
        api.getWith(s, "/api/v1/quotes?filter=EXPIRED").andExpect(jsonPath("$.totalElements").value(1));
        sell(s, old, "20000", key()).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("venció")));
        api.postWith(s, "/api/v1/quotes/" + old + "/reject", "{\"reason\":\"Le pareció caro\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
        api.postWith(s, "/api/v1/quotes/" + old + "/reject", "{\"reason\":\"otra vez\"}")
                .andExpect(status().isConflict());
    }

    @Test
    void permissions() throws Exception {
        Owned owner = api.newTenant("cotizaciones-roles");
        Session s = owner.tenant();
        UUID paper = product(s, "RESMA", "Resma carta", UND, "20000");

        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        String body = """
                {"prospectName":"Luis","items":[{"productId":"%s","quantity":1,"unitPrice":20000,
                 "discountPercent":%s}]}""";
        // El cajero cotiza, pero un descuento por encima del máximo de Ajustes (0 %) exige el permiso de descuentos
        api.postWith(cashier, "/api/v1/quotes", body.formatted(paper, "10")).andExpect(status().isForbidden());
        UUID quote = id(api.postWith(cashier, "/api/v1/quotes", body.formatted(paper, "0"))
                .andExpect(status().isCreated()), "$.id");

        Session accountant = api.joinAs(s, owner.tenantId(), "ACCOUNTANT").session();
        api.getWith(accountant, "/api/v1/quotes/" + quote).andExpect(status().isOk());
        api.postWith(accountant, "/api/v1/quotes", body.formatted(paper, "0")).andExpect(status().isForbidden());
        Session warehouse = api.joinAs(s, owner.tenantId(), "WAREHOUSE").session();
        api.getWith(warehouse, "/api/v1/quotes").andExpect(status().isForbidden());
    }

    // ---------------------------------------------------------------- apoyo

    private LocalDate today() {
        return LocalDate.now(ZoneId.of("America/Bogota"));
    }

    private UUID product(Session s, String sku, String name, UUID unit, String price) throws Exception {
        return id(api.postWith(s, "/api/v1/products", """
                {"sku":"%s","name":"%s","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":%s,
                 "trackInventory":false}
                """.formatted(sku, name, unit, IVA19, price)).andExpect(status().isCreated()), "$.id");
    }

    private UUID customer(Session s, String document, String first, String last) throws Exception {
        return id(api.postWith(s, "/api/v1/customers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"%s","firstNames":"%s","lastNames":"%s",
                 "phone":"3001234567"}
                """.formatted(document, first, last)).andExpect(status().isCreated()), "$.id");
    }

    private ResultActions sell(Session s, UUID quote, String cash, String key) throws Exception {
        return api.postWithHeaders(s, "/api/v1/quotes/" + quote + "/sell", """
                {"payments":[{"paymentMethodId":"%s","amount":%s}]}""".formatted(CASH, cash),
                "Idempotency-Key", key);
    }
}
