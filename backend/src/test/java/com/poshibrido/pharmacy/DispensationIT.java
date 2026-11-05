package com.poshibrido.pharmacy;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.catalog.CatalogFixturesAccess;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
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
 * Dispensación (Fase 13-4, decisión 282): bajo fórmula solo con el permiso y confirmando la fórmula; en antibióticos,
 * con sus datos; libro de dispensación; roles Director técnico y Auxiliar; datos del director técnico.
 */
class DispensationIT extends IntegrationTest {

    /** Hoy en la zona del negocio (Bogotá): GitHub corre en UTC y de 7 p. m. a medianoche ya es mañana. */
    private static final LocalDate TODAY = LocalDate.now(java.time.ZoneId.of("America/Bogota"));

    @Test
    void dispensesWithPrescriptionAndKeepsTheBook() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("dispensa");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["CREDIT","MEDICINES"]}""").andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());

        UUID loratadine = medicine(pos, s, "LORA", "{\"kind\":\"MEDICINE\",\"saleCondition\":\"PRESCRIPTION\"}");
        UUID amox = medicine(pos, s, "AMOX", "{\"kind\":\"MEDICINE\",\"saleCondition\":\"PRESCRIPTION\",\"atc\":\"J01CA04\"}");
        UUID acet = medicine(pos, s, "ACET", "{\"kind\":\"MEDICINE\",\"saleCondition\":\"OTC\"}");
        pos.openCash(s, CAJA_1, "0");
        api.getWith(s, "/api/v1/medicines/dispensing?productIds=" + loratadine + "," + amox + "," + acet)
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.productId=='" + amox + "')].strict").value(true));

        // Venta libre: nada que confirmar.
        pos.sellCash(s, acet, "1", "5000").andExpect(status().isCreated());
        // Bajo fórmula: sin confirmar no; confirmando sí.
        sell(s, loratadine, null).andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("fórmula")));
        sell(s, loratadine, "{\"prescriptionSeen\":true}").andExpect(status().isCreated());
        // Antibiótico: los datos de la fórmula.
        sell(s, amox, "{\"prescriptionSeen\":true}").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("quién firmó")));
        sell(s, amox, dispensation(TODAY.plusDays(1))).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("futura")));
        String sale = body(sell(s, amox, dispensation(TODAY.minusDays(1))).andExpect(status().isCreated()));

        // Un cajero no dispensa; el auxiliar de farmacia sí.
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        pos.openCash(cashier, pos.newRegister(s, api.principalBranchId(s), "CAJA-2"), "0");
        sell(cashier, loratadine, "{\"prescriptionSeen\":true}").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail", containsString("director técnico")));
        Session assistant = api.joinAs(s, owner.tenantId(), "PHARMACY_ASSISTANT").session();
        pos.openCash(assistant, pos.newRegister(s, api.principalBranchId(s), "CAJA-3"), "0");
        sell(assistant, loratadine, "{\"prescriptionSeen\":true}").andExpect(status().isCreated());
        api.getWith(assistant, "/api/v1/pharmacy/dispensations").andExpect(status().isForbidden());

        // Libro: 3 dispensaciones, 1 de antibiótico con sus datos.
        api.getWith(s, "/api/v1/pharmacy/dispensations").andExpect(jsonPath("$.totalElements").value(3));
        String book = body(api.getWith(s, "/api/v1/pharmacy/dispensations?antibioticOnly=true").andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(book, "$.totalElements")).isEqualTo(1);
        assertThat((String) JsonPath.read(book, "$.content[0].patientDocument")).isEqualTo("1020304050");
        assertThat((String) JsonPath.read(book, "$.content[0].prescriberName")).isEqualTo("Dra. Marta Gómez");
        assertThat((String) JsonPath.read(book, "$.content[0].lines[0].lots")).isEqualTo("L-AMOX");
        assertThat((String) JsonPath.read(book, "$.content[0].saleNumber"))
                .endsWith("-" + JsonPath.read(sale, "$.number"));
        api.getWith(s, "/api/v1/pharmacy/dispensations?search=marta").andExpect(jsonPath("$.totalElements").value(1));

        // Director técnico (rol y datos).
        Session director = api.joinAs(s, owner.tenantId(), "PHARMACIST").session();
        api.getWith(director, "/api/v1/pharmacy/dispensations").andExpect(status().isOk());
        api.putWith(s, "/api/v1/pharmacy/technical-director", """
                {"name":"Laura Pérez","profession":"PHARMACY_REGENT"}""").andExpect(status().is(422));
        api.putWith(s, "/api/v1/pharmacy/technical-director", """
                {"name":"Laura Pérez","profession":"PHARMACY_REGENT","license":"TP-1234"}""").andExpect(status().isOk());
        api.getWith(director, "/api/v1/pharmacy/technical-director").andExpect(jsonPath("$.license").value("TP-1234"));
        api.putWith(director, "/api/v1/pharmacy/technical-director", "{}").andExpect(status().isForbidden());

        // Sin el módulo no aplica: se vende sin confirmar.
        api.putWith(s, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["CREDIT"]}""").andExpect(status().isOk());
        Session plain = TestApi.session(api.refreshRaw(s.refreshToken()).andExpect(status().isOk()).andReturn());
        sell(plain, loratadine, null).andExpect(status().isCreated());
        api.getWith(plain, "/api/v1/pharmacy/dispensations").andExpect(status().isForbidden());
    }

    private UUID medicine(PosTestSupport pos, Session s, String sku, String sheet) throws Exception {
        UUID id = id(api.postWith(s, "/api/v1/products", CatalogFixturesAccess.simpleProduct(sku, "Producto " + sku, "5000"))
                .andExpect(status().isCreated()), "$.id");
        api.putWith(s, "/api/v1/products/" + id + "/medicine", sheet).andExpect(status().isOk());
        api.postWithHeaders(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"Ingreso","lines":[{"productId":"%s","direction":"IN","quantity":20,
                 "lotNumber":"L-%s","expirationDate":"%s"}]}""".formatted(api.principalBranchId(s), id, sku,
                TODAY.plusYears(2)), "Idempotency-Key", key()).andExpect(status().isCreated());
        return id;
    }

    private ResultActions sell(Session s, UUID product, String dispensation) throws Exception {
        return api.postWithHeaders(s, "/api/v1/sales", """
                {"items":[{"productId":"%s","quantity":1}],"payments":[{"paymentMethodId":"%s","amount":5000}],
                 "dispensation":%s}""".formatted(product, CASH, dispensation == null ? "null" : dispensation),
                "Idempotency-Key", key());
    }

    private static String dispensation(LocalDate date) {
        return """
                {"prescriptionSeen":true,"prescriberName":"Dra. Marta Gómez","prescriberLicense":"RM 55",
                 "prescriptionDate":"%s","patientDocument":"1.020.304.050","patientName":"Juan Ruiz"}""".formatted(date);
    }
}
