package com.poshibrido.finance;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.parties.domain.Nit;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
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
 * Retenciones (Finanzas parte B, decisión 322): en la venta y en el abono de un pedido, lo que puede hacer el cajero
 * (solo las de la ficha del cliente), el reporte, el certificado, la venta anulada y la reversa al cancelar un pedido.
 */
class WithholdingsIT extends IntegrationTest {

    private static final UUID WITHHOLDING = UUID.fromString("01920000-0000-7000-8000-000000000706");
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Bogota"));

    @Test
    void salesWithWithholdingsReportCertificatesAndVoid() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("retenciones");
        Session s = owner.tenant();
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        // Servicio de $1.190.000 con IVA incluido: base $1.000.000 e IVA $190.000.
        UUID service = pos.service(s, "MARMOL", "1190000");
        UUID indesa = customer(s, "900123456", "Indesa");
        UUID other = customer(s, "800555444", "Otro cliente");
        UUID ownSession = pos.openCash(s, CAJA_1, "0");

        // El medio "Retención" existe y no mueve la caja.
        api.getWith(s, "/api/v1/payment-methods")
                .andExpect(jsonPath("$[?(@.code == 'WITHHOLDING')].affectsCash").value(false));

        // --- Validaciones.
        pos.sell(s, sale(service, null, "1130000", "[{\"type\":\"RETEFUENTE\",\"rate\":6}]", "60000"), key())
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("Elige el cliente")));
        pos.sell(s, sale(service, indesa, "1130000", "[]", "60000"), key()).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("Falta el detalle")));
        pos.sell(s, sale(service, indesa, "1140000", "[{\"type\":\"RETEFUENTE\",\"rate\":6}]", "50000"), key())
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("no coincide")));
        pos.sell(s, sale(service, indesa, "1130000", "[{\"type\":\"RETEIVA\",\"rate\":15},{\"type\":\"RETEIVA\",\"rate\":15}]",
                "60000"), key()).andExpect(status().is(422));
        pos.sell(s, """
                {"customerId":"%s","items":[{"productId":"%s","quantity":1}],
                 "payments":[{"paymentMethodId":"%s","amount":1190000,
                              "withholdings":[{"type":"RETEFUENTE","rate":6}]}]}
                """.formatted(indesa, service, CASH), key()).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("línea de Retención")));

        // --- El dueño (con finance:manage) registra retefuente 6 % y reteIVA 15 %: 60.000 + 28.500.
        String sold = body(pos.sell(s, sale(service, indesa, "1101500",
                "[{\"type\":\"RETEFUENTE\",\"rate\":6},{\"type\":\"RETEIVA\",\"rate\":15}]", "88500"), key())
                .andExpect(status().isCreated()));
        String saleId = JsonPath.read(sold, "$.id");
        assertThat(number(sold, "$.total")).isEqualByComparingTo("1190000");
        List<String> codes = JsonPath.read(sold, "$.payments[*].methodCode");
        assertThat(codes).containsExactly("TRANSFER", "WITHHOLDING");
        // No queda deuda ni toca la caja.
        assertThat(number(body(api.getWith(s, "/api/v1/cash/sessions/" + ownSession + "/report")), "$.cash.expected"))
                .isEqualByComparingTo("0");

        // --- El cajero: sin retenciones en la ficha del cliente no puede.
        UUID cashierSession = pos.openCash(cashier, pos.newRegister(s, api.principalBranchId(s), "C2"), "0");
        pos.sell(cashier, sale(service, indesa, "1130000", "[{\"type\":\"RETEFUENTE\",\"rate\":6}]", "60000"), key())
                .andExpect(status().isForbidden());
        api.putWith(cashier, "/api/v1/customers/" + indesa + "/withholdings",
                "{\"items\":[{\"type\":\"RETEFUENTE\",\"rate\":6}]}").andExpect(status().isForbidden());
        api.putWith(s, "/api/v1/customers/" + indesa + "/withholdings",
                "{\"items\":[{\"type\":\"RETEFUENTE\",\"rate\":0}]}").andExpect(status().is(422));
        api.putWith(s, "/api/v1/customers/" + indesa + "/withholdings",
                "{\"items\":[{\"type\":\"reteica\",\"rate\":0.966},{\"type\":\"RETEFUENTE\",\"rate\":6}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].type").value("RETEFUENTE"))
                .andExpect(jsonPath("$[1].type").value("RETEICA"));
        api.getWith(cashier, "/api/v1/customers/" + indesa + "/withholdings").andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        // Con la ficha: solo esa tarifa sobre la base que calcula XASKA (aunque mande otra base o tarifa).
        pos.sell(cashier, sale(service, indesa, "1140000", "[{\"type\":\"RETEFUENTE\",\"amount\":50000}]", "50000"),
                key()).andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("6 %")));
        pos.sell(cashier, sale(service, indesa, "1130000", "[{\"type\":\"RETEIVA\",\"rate\":15}]", "60000"), key())
                .andExpect(status().isForbidden());
        pos.sell(cashier, sale(service, other, "1130000", "[{\"type\":\"RETEFUENTE\",\"rate\":6}]", "60000"), key())
                .andExpect(status().isForbidden());
        // Retefuente 60.000 + reteICA 9.660 (9,66 por mil de $1.000.000).
        String cashierSale = body(pos.sell(cashier, sale(service, indesa, "1120340",
                "[{\"type\":\"RETEFUENTE\",\"rate\":1,\"base\":5},{\"type\":\"RETEICA\"}]", "69660"), key())
                .andExpect(status().isCreated()));
        assertThat(number(cashierSale, "$.total")).isEqualByComparingTo("1190000");
        api.getWith(cashier, "/api/v1/withholdings").andExpect(status().isForbidden());
        pos.close(cashier, cashierSession, "0").andExpect(status().isOk());

        // --- Reporte del mes.
        String summary = body(api.getWith(s, "/api/v1/withholdings/summary").andExpect(status().isOk()));
        assertThat(number(summary, "$.total")).isEqualByComparingTo("158160");
        assertThat((Integer) JsonPath.read(summary, "$.count")).isEqualTo(4);
        assertThat((Integer) JsonPath.read(summary, "$.pendingCertificates")).isEqualTo(4);
        assertThat((String) JsonPath.read(summary, "$.byType[0].type")).isEqualTo("RETEFUENTE");
        assertThat(number(summary, "$.byType[0].total")).isEqualByComparingTo("120000");
        assertThat((String) JsonPath.read(summary, "$.byCustomer[0].name")).isEqualTo("Indesa");
        String list = body(api.getWith(s, "/api/v1/withholdings?type=RETEFUENTE").andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(list, "$.totalElements")).isEqualTo(2);
        assertThat(number(list, "$.content[0].base")).isEqualByComparingTo("1000000");
        assertThat((String) JsonPath.read(list, "$.content[0].origin")).startsWith("Venta POS-");
        api.getWith(s, "/api/v1/withholdings?certificate=OTRO").andExpect(status().is(422));

        // --- Certificado recibido (de las retenciones de Indesa).
        List<String> ids = JsonPath.read(body(api.getWith(s, "/api/v1/withholdings?customerId=" + indesa)),
                "$.content[*].id");
        api.postWith(cashier, "/api/v1/withholdings/certificate", "{\"ids\":[\"" + ids.get(0) + "\"],\"received\":true}")
                .andExpect(status().isForbidden());
        api.postWith(s, "/api/v1/withholdings/certificate", "{\"ids\":[\"" + String.join("\",\"", ids)
                + "\"],\"received\":true,\"note\":\"Certificado bimestral\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(4));
        api.getWith(s, "/api/v1/withholdings/summary").andExpect(jsonPath("$.pendingCertificates").value(0));
        api.getWith(s, "/api/v1/withholdings?certificate=RECEIVED").andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.content[0].certificateNote").value("Certificado bimestral"));

        // --- Exportar.
        String csv = new String(api.getWith(s, "/api/v1/withholdings.csv").andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(csv).contains("Fecha;Cliente;Documento;Tipo;Base").contains("retención en la fuente")
                .contains("Recibido");

        // --- Venta anulada: su retención deja de sumar (se ve con "anuladas").
        api.postWith(s, "/api/v1/sales/" + saleId + "/void", "{\"reason\":\"Se facturó mal\"}").andExpect(status().isOk());
        assertThat(number(body(api.getWith(s, "/api/v1/withholdings/summary")), "$.total"))
                .isEqualByComparingTo("69660");
        api.getWith(s, "/api/v1/withholdings").andExpect(jsonPath("$.totalElements").value(2));
        List<Boolean> voided = JsonPath.read(body(api.getWith(s, "/api/v1/withholdings?includeVoided=true")),
                "$.content[*].voided");
        assertThat(voided).containsExactlyInAnyOrder(true, true, false, false);
        api.postWith(s, "/api/v1/withholdings/certificate", "{\"ids\":[\"" + ids.get(ids.size() - 1)
                + "\"],\"received\":false}").andExpect(status().is(422));

        // Retención es solo para ventas y pedidos: no para gastos, fiados ni pagos a proveedores.
        api.postWith(s, "/api/v1/expenses", "{\"amount\":1000,\"categoryId\":\"01920000-0000-7000-8000-000000000a09\","
                + "\"paymentMethodId\":\"" + WITHHOLDING + "\",\"branchId\":\"" + api.principalBranchId(s) + "\"}")
                .andExpect(status().is(422));

        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbc.update("UPDATE " + schema + ".withholdings SET amount = 1"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".audit_log WHERE action IN "
                + "('CUSTOMER_WITHHOLDINGS_UPDATED', 'WITHHOLDING_CERTIFICATE_RECEIVED')", Integer.class)).isEqualTo(2);
    }

    @Test
    void orderDepositWithWithholdingIsReversedWhenCancelled() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("retpedido");
        Session s = owner.tenant();
        UUID marble = pos.service(s, "MESON", "1190000");
        UUID indesa = customer(s, "900777666", "Indesa");
        pos.openCash(s, CAJA_1, "0");
        String created = body(api.postWith(s, "/api/v1/orders", """
                {"customerId":"%s","dueDate":"%s","items":[{"productId":"%s","quantity":2,"unitPrice":1190000}]}
                """.formatted(indesa, TODAY.plusDays(10), marble)).andExpect(status().isCreated()));
        UUID order = UUID.fromString(JsonPath.read(created, "$.id"));
        assertThat(number(created, "$.pendingTaxBase")).isEqualByComparingTo("2000000");
        assertThat(number(created, "$.pendingIva")).isEqualByComparingTo("380000");
        assertThat(number(created, "$.items[0].taxBase")).isEqualByComparingTo("2000000");

        // Abono de $1.190.000 (base $1.000.000): Indesa transfiere $1.130.000 y retiene el 6 %.
        api.postWithHeaders(s, "/api/v1/orders/" + order + "/payments", """
                {"amount":1130000,"paymentMethodId":"%s","reference":"TRF-1",
                 "withholdings":[{"type":"RETEFUENTE","rate":6,"amount":50000}]}
                """.formatted(TRANSFER), "Idempotency-Key", key()).andExpect(status().isCreated());
        String paid = body(api.postWithHeaders(s, "/api/v1/orders/" + order + "/payments", """
                {"amount":1130000,"paymentMethodId":"%s","reference":"TRF-1",
                 "withholdings":[{"type":"RETEFUENTE","rate":6}]}
                """.formatted(TRANSFER), "Idempotency-Key", key()).andExpect(status().isCreated()));
        // Con "amount" 50.000 el dueño escribió el valor directo: también vale (se lo puede corregir).
        assertThat(number(paid, "$.deposited")).isEqualByComparingTo("2370000");
        assertThat(number(paid, "$.balanceDue")).isEqualByComparingTo("10000");
        List<String> methods = JsonPath.read(paid, "$.payments[*].methodCode");
        assertThat(methods).containsExactly("TRANSFER", "WITHHOLDING", "TRANSFER", "WITHHOLDING");
        // No se puede abonar más de lo que falta contando la retención.
        api.postWithHeaders(s, "/api/v1/orders/" + order + "/payments", """
                {"amount":1,"paymentMethodId":"%s","withholdings":[{"type":"RETEFUENTE","amount":10000}]}
                """.formatted(CASH), "Idempotency-Key", key()).andExpect(status().is(422));
        // La retención no es un medio para abonar ni para devolver.
        api.postWithHeaders(s, "/api/v1/orders/" + order + "/payments", """
                {"amount":1000,"paymentMethodId":"%s"}""".formatted(WITHHOLDING), "Idempotency-Key", key())
                .andExpect(status().is(422));
        assertThat(number(body(api.getWith(s, "/api/v1/withholdings/summary")), "$.total"))
                .isEqualByComparingTo("110000");

        // Cancelar: primero se reversa lo retenido ($110.000) y se devuelve lo demás por transferencia.
        String cancelled = body(api.postWith(s, "/api/v1/orders/" + order + "/cancel", """
                {"reason":"El cliente desistió","refundMethodId":"%s","reference":"DEV-1"}
                """.formatted(TRANSFER)).andExpect(status().isOk()));
        assertThat(number(cancelled, "$.depositAvailable")).isEqualByComparingTo("0");
        List<String> after = JsonPath.read(cancelled, "$.payments[*].methodCode");
        assertThat(after).endsWith("WITHHOLDING", "TRANSFER");
        assertThat(number(cancelled, "$.payments[-1].amount")).isEqualByComparingTo("-2260000");
        String summary = body(api.getWith(s, "/api/v1/withholdings/summary"));
        assertThat(number(summary, "$.total")).isEqualByComparingTo("0");
        assertThat((Integer) JsonPath.read(summary, "$.count")).isEqualTo(2);
        String rows = body(api.getWith(s, "/api/v1/withholdings").andExpect(jsonPath("$.totalElements").value(4)));
        List<Boolean> reversals = JsonPath.read(rows, "$.content[*].reversal");
        assertThat(reversals).containsExactlyInAnyOrder(true, true, false, false);
        assertThat((String) JsonPath.read(rows, "$.content[0].origin")).startsWith("Pedido PED-");
    }

    @Test
    void deliveryWithholdsOnlyOnWhatTheDepositDoesNotCover() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("retentrega");
        Session s = owner.tenant();
        UUID marble = pos.service(s, "MESON", "1190000");
        UUID indesa = customer(s, "900111222", "Indesa");
        pos.openCash(s, CAJA_1, "0");
        String created = body(api.postWith(s, "/api/v1/orders", """
                {"customerId":"%s","dueDate":"%s","items":[{"productId":"%s","quantity":1,"unitPrice":1190000}]}
                """.formatted(indesa, TODAY.plusDays(3), marble)).andExpect(status().isCreated()));
        UUID order = UUID.fromString(JsonPath.read(created, "$.id"));
        String item = JsonPath.read(created, "$.items[0].id");
        api.postWithHeaders(s, "/api/v1/orders/" + order + "/payments", """
                {"amount":595000,"paymentMethodId":"%s"}""".formatted(CASH), "Idempotency-Key", key())
                .andExpect(status().isCreated());
        // Falta $595.000 (base $500.000): retefuente 6 % = $30.000; se transfieren $565.000.
        api.postWithHeaders(s, "/api/v1/orders/" + order + "/deliver", """
                {"itemIds":["%s"],"payments":[{"paymentMethodId":"%s","amount":565000,"reference":"T"},
                  {"paymentMethodId":"%s","amount":30000,"withholdings":[{"type":"RETEFUENTE","rate":6}]}]}
                """.formatted(item, TRANSFER, WITHHOLDING), "Idempotency-Key", key()).andExpect(status().isOk())
                .andExpect(jsonPath("$.order.status").value("DELIVERED"));
        String list = body(api.getWith(s, "/api/v1/withholdings"));
        assertThat(number(list, "$.content[0].base")).isEqualByComparingTo("500000");
        assertThat(number(list, "$.content[0].amount")).isEqualByComparingTo("30000");
    }

    private UUID customer(Session s, String nit, String name) throws Exception {
        return id(api.postWith(s, "/api/v1/customers", """
                {"personType":"LEGAL","documentType":"NIT","documentNumber":"%s","verificationDigit":%d,
                 "businessName":"%s"}
                """.formatted(nit, Nit.verificationDigit(nit), name)).andExpect(status().isCreated()), "$.id");
    }

    private static String sale(UUID product, UUID customer, String transfer, String detail, String withheld) {
        return """
                {%s"items":[{"productId":"%s","quantity":1}],
                 "payments":[{"paymentMethodId":"%s","amount":%s,"reference":"TRF"},
                             {"paymentMethodId":"%s","amount":%s,"withholdings":%s}]}
                """.formatted(customer == null ? "" : "\"customerId\":\"" + customer + "\",", product, TRANSFER,
                transfer, WITHHOLDING, withheld, detail);
    }
}
