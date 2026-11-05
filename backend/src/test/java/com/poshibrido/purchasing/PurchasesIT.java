package com.poshibrido.purchasing;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.catalog.CatalogFixturesAccess;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.TRANSFER;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Compras (Fase 13-2, decisión 280): recepción contra factura con revisión técnica, lotes y vencimientos obligatorios en
 * medicamentos, temperatura de lo que va en nevera, rechazos, pago de contado desde la caja, crédito y abonos.
 */
class PurchasesIT extends IntegrationTest {

    /** Hoy en la zona del negocio (Bogotá): GitHub corre en UTC y de 7 p. m. a medianoche ya es mañana. */
    private static final LocalDate TODAY = LocalDate.now(java.time.ZoneId.of("America/Bogota"));
    private static final String FUTURE = TODAY.plusYears(2).toString();

    @Test
    void receivesInvoiceWithLotsPaysAndTracksPayables() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("compras");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["CREDIT","MEDICINES"]}""").andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);

        UUID amox = product(s, "AMOX", "{\"kind\":\"MEDICINE\",\"saleCondition\":\"PRESCRIPTION\",\"atc\":\"J01CA04\"}");
        UUID insulin = product(s, "INSUL",
                "{\"kind\":\"MEDICINE\",\"saleCondition\":\"PRESCRIPTION\",\"coldChain\":true}");
        UUID soap = product(s, "JABON", null);
        api.getWith(s, "/api/v1/products/" + amox + "/medicine").andExpect(jsonPath("$.tracksLots").value(true));
        UUID supplier = id(api.postWith(s, "/api/v1/suppliers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"%d","firstNames":"Droguería","lastNames":"Mayorista"}"""
                .formatted(10_000_000 + (System.nanoTime() % 80_000_000))).andExpect(status().isCreated()), "$.id");
        UUID cashSession = pos.openCash(s, CAJA_1, "100000");

        String amoxLine = line(amox, "10", "1000", "0", "L-001", FUTURE, null);
        String insulinLine = line(insulin, "2", "30000", "0", "I-77", FUTURE, null);
        String soapLine = line(soap, "5", "2000", "19", null, null, null);
        String rejected = line(amox, "2", "1000", "0", "L-001", FUTURE, "Caja rota");

        // Reglas de la recepción técnica.
        receive(s, branch, supplier, "FV-100", "PAID", "[" + line(amox, "1", "1000", "0", null, null, null) + "]", "5")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("lote y vencimiento")));
        receive(s, branch, supplier, "FV-100", "PAID",
                "[" + line(amox, "1", "1000", "0", "L-X", TODAY.toString(), null) + "]", null)
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("vencido")));
        receive(s, branch, supplier, "FV-100", "PAID", "[" + insulinLine + "]", null)
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("temperatura")));
        receive(s, branch, supplier, "FV-100", "PAID", "[" + insulinLine + "]", "10")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("fuera de 2 a 8")));
        receive(s, branch, supplier, "FV-100", "PAID", "[" + rejected + "]", null)
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("ningún producto")));
        api.postWith(s, "/api/v1/purchases", request(branch, supplier, "FV-100", "PAID", "[" + soapLine + "]", null)
                .replace("\"checksConfirmed\":true", "\"checksConfirmed\":false"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("revisión técnica")));
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        api.postWith(cashier, "/api/v1/purchases", request(branch, supplier, "FV-100", "PAID", "[" + soapLine + "]", null))
                .andExpect(status().isForbidden());

        // Recepción válida de contado en efectivo: entra lo aceptado, lo rechazado queda registrado.
        String k = key();
        String body = request(branch, supplier, "fv-100", "PAID",
                "[" + amoxLine + "," + insulinLine + "," + soapLine + "," + rejected + "]", "5.0");
        String receipt = body(api.postWithHeaders(s, "/api/v1/purchases", body, "Idempotency-Key", k)
                .andExpect(status().isCreated()));
        assertThat(number(receipt, "$.summary.total")).isEqualByComparingTo("81900");
        assertThat(number(receipt, "$.subtotal")).isEqualByComparingTo("80000");
        assertThat(number(receipt, "$.taxTotal")).isEqualByComparingTo("1900");
        assertThat(number(receipt, "$.summary.rejectedTotal")).isEqualByComparingTo("2000");
        assertThat(number(receipt, "$.summary.balance")).isEqualByComparingTo("0");
        assertThat((String) JsonPath.read(receipt, "$.summary.supplierInvoice")).isEqualTo("FV-100");
        assertThat((String) JsonPath.read(receipt, "$.lines[3].status")).isEqualTo("REJECTED");
        assertThat((Boolean) JsonPath.read(receipt, "$.payments[0].fromCash")).isTrue();
        String receiptId = JsonPath.read(receipt, "$.summary.id");
        // Repetir con la misma clave no duplica; la misma factura sin clave es 409.
        api.postWithHeaders(s, "/api/v1/purchases", body, "Idempotency-Key", k).andExpect(status().isCreated())
                .andExpect(jsonPath("$.summary.id").value(receiptId));
        api.postWith(s, "/api/v1/purchases", body).andExpect(status().isConflict());

        assertThat(pos.stock(s, amox)).isEqualByComparingTo("10");
        assertThat(pos.stock(s, soap)).isEqualByComparingTo("5");
        assertThat(lotBalance(owner, "L-001")).isEqualByComparingTo("10");
        api.getWith(s, "/api/v1/products/" + amox).andExpect(jsonPath("$.cost").value(1000));
        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + cashSession + "/report"));
        assertThat(number(report, "$.cash.supplierPayments")).isEqualByComparingTo("-81900");
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("18100");

        // A crédito: el mismo lote con otro vencimiento se rechaza; con el mismo, suma y recalcula el costo.
        receive(s, branch, supplier, "FV-101", "CREDIT",
                "[" + line(amox, "5", "1200", "0", "L-001", TODAY.plusYears(3).toString(), null) + "]", null)
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("ya está registrado")));
        String credit = body(receive(s, branch, supplier, "FV-101", "CREDIT",
                "[" + line(amox, "5", "1200", "0", "l-001", FUTURE, null) + "]", null).andExpect(status().isCreated()));
        String creditId = JsonPath.read(credit, "$.summary.id");
        assertThat(lotBalance(owner, "L-001")).isEqualByComparingTo("15");
        api.getWith(s, "/api/v1/products/" + amox).andExpect(jsonPath("$.cost").value(1066.67));

        // Cuentas por pagar y abonos (el cajero no paga; no se paga de más).
        api.getWith(s, "/api/v1/purchases/payables").andExpect(jsonPath("$.totalDue").value(6000))
                .andExpect(jsonPath("$.receipts.length()").value(1));
        api.postWith(cashier, "/api/v1/purchases/%s/payments".formatted(creditId),
                "{\"amount\":1000,\"paymentMethodId\":\"%s\"}".formatted(TRANSFER)).andExpect(status().isForbidden());
        pay(s, creditId, "2000", TRANSFER).andExpect(status().isCreated()).andExpect(jsonPath("$.fromCash").value(false));
        pay(s, creditId, "5000", TRANSFER).andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("saldo")));
        pay(s, creditId, "4000", TRANSFER).andExpect(status().isCreated());
        api.getWith(s, "/api/v1/purchases/payables").andExpect(jsonPath("$.receipts.length()").value(0));

        // En efectivo no se paga más de lo que hay en la caja.
        String big = JsonPath.read(body(receive(s, branch, supplier, "FV-102", "CREDIT",
                "[" + line(soap, "50", "2000", "0", null, null, null) + "]", null).andExpect(status().isCreated())),
                "$.summary.id");
        pay(s, big, "100000", CASH).andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("efectivo")));

        api.getWith(s, "/api/v1/purchases").andExpect(jsonPath("$.totalElements").value(3));
        api.getWith(s, "/api/v1/purchases/" + receiptId).andExpect(jsonPath("$.lines.length()").value(4))
                .andExpect(jsonPath("$.lines[0].lotNumber").value("L-001"));
        api.getWith(s, "/api/v1/audit?action=PURCHASE_RECEIVED").andExpect(jsonPath("$.totalElements").value(3));
        api.getWith(s, "/api/v1/audit?action=SUPPLIER_PAYMENT_CREATED").andExpect(jsonPath("$.totalElements").value(2));
    }

    private UUID product(Session s, String sku, String medicine) throws Exception {
        UUID id = id(api.postWith(s, "/api/v1/products", CatalogFixturesAccess.simpleProduct(sku, "Producto " + sku, "5000"))
                .andExpect(status().isCreated()), "$.id");
        if (medicine != null) {
            api.putWith(s, "/api/v1/products/" + id + "/medicine", medicine).andExpect(status().isOk());
        }
        return id;
    }

    private static String line(UUID product, String qty, String cost, String tax, String lot, String expiration,
                               String rejectReason) {
        return """
                {"productId":"%s","quantity":%s,"unitCost":%s,"taxRate":%s,"lotNumber":%s,"expirationDate":%s,
                 "status":"%s","rejectReason":%s}""".formatted(product, qty, cost, tax,
                lot == null ? "null" : "\"" + lot + "\"", expiration == null ? "null" : "\"" + expiration + "\"",
                rejectReason == null ? "ACCEPTED" : "REJECTED", rejectReason == null ? "null" : "\"" + rejectReason + "\"");
    }

    private static String request(UUID branch, UUID supplier, String invoice, String payment, String lines,
                                  String temperature) {
        return """
                {"branchId":"%s","supplierId":"%s","supplierInvoice":"%s","invoiceDate":"%s","paymentType":"%s",
                 "paymentMethodId":%s,"dueDate":%s,"checksConfirmed":true,"coldChainTemperature":%s,"lines":%s}"""
                .formatted(branch, supplier, invoice, TODAY, payment,
                        "PAID".equals(payment) ? "\"" + CASH + "\"" : "null",
                        "CREDIT".equals(payment) ? "\"" + TODAY.plusDays(30) + "\"" : "null",
                        temperature == null ? "null" : temperature, lines);
    }

    private ResultActions receive(Session s, UUID branch, UUID supplier, String invoice, String payment, String lines,
                                  String temperature) throws Exception {
        return api.postWith(s, "/api/v1/purchases", request(branch, supplier, invoice, payment, lines, temperature));
    }

    private ResultActions pay(Session s, String receipt, String amount, UUID method) throws Exception {
        return api.postWithHeaders(s, "/api/v1/purchases/%s/payments".formatted(receipt),
                "{\"amount\":%s,\"paymentMethodId\":\"%s\"}".formatted(amount, method), "Idempotency-Key", key());
    }

    private BigDecimal lotBalance(Owned owner, String lot) {
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        return jdbc.queryForObject("SELECT b.quantity FROM " + schema + ".lot_balances b JOIN " + schema
                + ".lots l ON l.id = b.lot_id WHERE l.lot_number = ?", BigDecimal.class, lot);
    }
}
