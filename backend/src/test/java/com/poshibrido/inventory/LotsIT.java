package com.poshibrido.inventory;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.catalog.CatalogFixturesAccess;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
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
 * Lotes y vencimientos (Fase 13-3, decisión 281): FEFO en la venta (primero lo que no tiene lote), nunca un vencido,
 * la anulación vuelve a los mismos lotes, documentos de inventario por lote, baja con acta, devolución al proveedor,
 * alertas de vencimiento y trazabilidad.
 */
class LotsIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.now();

    @Test
    void sellsFefoDisposesReturnsAndTraces() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("lotes");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["CREDIT","MEDICINES"]}""").andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);

        // Existencia de antes (sin lote) y luego se vuelve medicamento: queda "sin lote".
        UUID amox = id(api.postWith(s, "/api/v1/products", CatalogFixturesAccess.simpleProduct("AMOX", "Amoxicilina", "5000"))
                .andExpect(status().isCreated()), "$.id");
        doc(s, "initial-balances", branch, null, "[" + line(amox, "3", null, null) + "]").andExpect(status().isCreated());
        api.putWith(s, "/api/v1/products/" + amox + "/medicine",
                "{\"kind\":\"MEDICINE\",\"saleCondition\":\"OTC\"}").andExpect(status().isOk());
        api.getWith(s, "/api/v1/inventory/lots/summary?branchId=" + branch).andExpect(jsonPath("$.unlottedProducts").value(1))
                .andExpect(jsonPath("$.alertMonths").value(3));

        // Una entrada de un producto con lotes exige el lote; un lote nuevo, el vencimiento.
        doc(s, "adjustments", branch, "Compra sin factura", "[" + in(amox, "5", null, null) + "]")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("lote y vencimiento")));
        doc(s, "adjustments", branch, "Compra sin factura", "[" + in(amox, "5", "A-1", null) + "]")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("vencimiento")));
        String nearA = TODAY.plusMonths(2).toString();
        String farB = TODAY.plusYears(2).toString();
        doc(s, "adjustments", branch, "Ingreso", "[" + in(amox, "5", "a-1", nearA) + "," + in(amox, "5", "B-2", farB) + "]")
                .andExpect(status().isCreated());
        assertThat(pos.stock(s, amox)).isEqualByComparingTo("13");
        api.getWith(s, "/api/v1/products/" + amox).andExpect(jsonPath("$.medicine.nextExpiration").value(nearA))
                .andExpect(jsonPath("$.medicine.expiringSoon").value(true));
        api.getWith(s, "/api/v1/inventory/lots?status=EXPIRING&branchId=" + branch)
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].lotNumber").value("A-1"));

        // Venta de 6: 3 sin lote y 3 del lote que vence primero (A-1). La anulación vuelve a los mismos.
        pos.openCash(s, CAJA_1, "50000");
        String sale = body(pos.sellCash(s, amox, "6", "30000").andExpect(status().isCreated()));
        String saleId = JsonPath.read(sale, "$.id");
        lots(s, amox, branch).andExpect(jsonPath("$.unlotted").value(0))
                .andExpect(jsonPath("$.lots[0].lotNumber").value("A-1")).andExpect(jsonPath("$.lots[0].quantity").value(2))
                .andExpect(jsonPath("$.lots[1].quantity").value(5));
        String trace = body(api.getWith(s, "/api/v1/inventory/lots/trace?productId=" + amox + "&lot=a-1")
                .andExpect(status().isOk()));
        assertThat(number(trace, "$.sold")).isEqualByComparingTo("3");
        assertThat((String) JsonPath.read(trace, "$.entries[1].document")).startsWith("Venta ");
        api.postWith(s, "/api/v1/sales/" + saleId + "/void", "{\"reason\":\"Error\"}").andExpect(status().isOk());
        lots(s, amox, branch).andExpect(jsonPath("$.unlotted").value(3)).andExpect(jsonPath("$.lots[0].quantity").value(5));

        // Conteo por lote: B-2 tiene 4 y aparece un lote C-3 que no estaba; lo sin lote se cuenta en 0.
        doc(s, "counts", branch, null, "[" + line(amox, "4", "B-2", null) + "," + line(amox, "2", "C-3", farB) + ","
                + line(amox, "0", null, null) + "]").andExpect(status().isCreated());
        lots(s, amox, branch).andExpect(jsonPath("$.unlotted").value(0)).andExpect(jsonPath("$.lots.length()").value(3));
        assertThat(pos.stock(s, amox)).isEqualByComparingTo("11");

        // Traslado: sin lote va con FEFO y cada parte llega con su lote; con lote, de ese lote.
        UUID north = id(api.postWith(s, "/api/v1/branches", """
                {"code":"NORTE","name":"Sede Norte"}
                """).andExpect(status().isCreated()), "$.id");
        api.postWithHeaders(s, "/api/v1/inventory/transfers", """
                {"fromBranchId":"%s","toBranchId":"%s","lines":[%s,%s]}""".formatted(branch, north,
                line(amox, "6", null, null), line(amox, "1", "C-3", null)), "Idempotency-Key", key())
                .andExpect(status().isCreated());
        lots(s, amox, north).andExpect(jsonPath("$.lots.length()").value(3))
                .andExpect(jsonPath("$.lots[0].lotNumber").value("A-1")).andExpect(jsonPath("$.lots[0].quantity").value(5))
                .andExpect(jsonPath("$.lots[1].quantity").value(1));
        lots(s, amox, branch).andExpect(jsonPath("$.lots.length()").value(2));

        // Un lote vencido no se vende; se da de baja con acta.
        UUID old = id(api.postWith(s, "/api/v1/products", CatalogFixturesAccess.simpleProduct("ACET", "Acetaminofén", "2000"))
                .andExpect(status().isCreated()), "$.id");
        api.putWith(s, "/api/v1/products/" + old + "/medicine",
                "{\"kind\":\"MEDICINE\",\"saleCondition\":\"OTC\"}").andExpect(status().isOk());
        doc(s, "adjustments", branch, "Encontrado en bodega",
                "[" + in(old, "2", "V-0", TODAY.minusDays(3).toString()) + "]").andExpect(status().isCreated());
        pos.sellCash(s, old, "1", "2000").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("vencido")));
        api.getWith(s, "/api/v1/inventory/lots/summary?branchId=" + branch).andExpect(jsonPath("$.expiredLots").value(1));
        api.postWith(s, "/api/v1/inventory/disposals", """
                {"branchId":"%s","reason":"Vencido","disposalMethod":" ","lines":[%s]}"""
                .formatted(branch, line(old, "2", "V-0", null))).andExpect(status().isBadRequest());
        api.postWithHeaders(s, "/api/v1/inventory/disposals", """
                {"branchId":"%s","reason":"Vencido","disposalMethod":"Gestor de residuos EcoCapital, acta 55",
                 "witnessName":"Ana Ruiz","lines":[%s]}""".formatted(branch, line(old, "2", "V-0", null)),
                "Idempotency-Key", key()).andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("DISPOSAL"))
                .andExpect(jsonPath("$.disposalMethod").value("Gestor de residuos EcoCapital, acta 55"))
                .andExpect(jsonPath("$.lines[0].lotNumber").value("V-0"));
        assertThat(pos.stock(s, old)).isEqualByComparingTo("0");
        api.getWith(s, "/api/v1/inventory/lots/summary?branchId=" + branch).andExpect(jsonPath("$.expiredLots").value(0));

        // Devolución al proveedor: sale del lote recibido y baja lo que se le debe.
        UUID supplier = id(api.postWith(s, "/api/v1/suppliers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"%d","firstNames":"Distri","lastNames":"Pharma"}"""
                .formatted(20_000_000 + (System.nanoTime() % 70_000_000))).andExpect(status().isCreated()), "$.id");
        String receipt = body(api.postWith(s, "/api/v1/purchases", """
                {"branchId":"%s","supplierId":"%s","supplierInvoice":"FV-9","invoiceDate":"%s","paymentType":"CREDIT",
                 "dueDate":"%s","checksConfirmed":true,"lines":[{"productId":"%s","quantity":10,"unitCost":1000,
                 "taxRate":0,"lotNumber":"R-7","expirationDate":"%s","status":"ACCEPTED"}]}"""
                .formatted(branch, supplier, TODAY, TODAY.plusDays(30), amox, farB)).andExpect(status().isCreated()));
        String receiptId = JsonPath.read(receipt, "$.summary.id");
        String returnBody = "{\"reason\":\"Empaque dañado\",\"lines\":[{\"receiptLineNo\":1,\"quantity\":4}]}";
        String returned = body(api.postWithHeaders(s, "/api/v1/purchases/" + receiptId + "/returns", returnBody,
                "Idempotency-Key", key()).andExpect(status().isCreated()));
        assertThat(number(returned, "$.summary.balance")).isEqualByComparingTo("6000");
        assertThat(number(returned, "$.summary.returnedTotal")).isEqualByComparingTo("4000");
        assertThat(number(returned, "$.lines[0].returnedQuantity")).isEqualByComparingTo("4");
        assertThat((String) JsonPath.read(returned, "$.returns[0].lines[0].lotNumber")).isEqualTo("R-7");
        api.postWith(s, "/api/v1/purchases/" + receiptId + "/returns",
                "{\"reason\":\"Otra\",\"lines\":[{\"receiptLineNo\":1,\"quantity\":7}]}")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("solo puedes devolver 6")));
        api.getWith(s, "/api/v1/purchases/payables").andExpect(jsonPath("$.totalDue").value(6000));
        String after = body(lots(s, amox, branch));
        assertThat(JsonPath.<java.util.List<Object>>read(after, "$.lots[?(@.lotNumber=='R-7')].quantity").toString())
                .isEqualTo("[6.0]");

        // Ajuste del aviso y auditoría.
        api.getWith(s, "/api/v1/settings").andExpect(jsonPath("$.expiryAlertMonths").value(3));
        api.getWith(s, "/api/v1/audit?action=PURCHASE_RETURNED").andExpect(jsonPath("$.totalElements").value(1));
        BigDecimal value = number(body(api.getWith(s, "/api/v1/inventory/lots?branchId=" + branch)), "$.totalElements");
        assertThat(value).isEqualByComparingTo("3");
    }

    private org.springframework.test.web.servlet.ResultActions lots(Session s, UUID product, UUID branch) throws Exception {
        return api.getWith(s, "/api/v1/inventory/lots/product?productId=" + product + "&branchId=" + branch)
                .andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions doc(Session s, String path, UUID branch, String reason,
                                                                   String lines) throws Exception {
        return api.postWithHeaders(s, "/api/v1/inventory/" + path, """
                {"branchId":"%s","reason":%s,"lines":%s}""".formatted(branch,
                reason == null ? "null" : "\"" + reason + "\"", lines), "Idempotency-Key", key());
    }

    private static String line(UUID product, String qty, String lot, String expiration) {
        return """
                {"productId":"%s","quantity":%s,"lotNumber":%s,"expirationDate":%s}""".formatted(product, qty,
                lot == null ? "null" : "\"" + lot + "\"", expiration == null ? "null" : "\"" + expiration + "\"");
    }

    private static String in(UUID product, String qty, String lot, String expiration) {
        return line(product, qty, lot, expiration).replace("{\"productId\"", "{\"direction\":\"IN\",\"productId\"");
    }
}
