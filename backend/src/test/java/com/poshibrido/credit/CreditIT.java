package com.poshibrido.credit;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
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
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Fiado: venta fiada con cupo, abonos, anulaciones, permisos y cartera por antigüedad (decisión 255). */
class CreditIT extends IntegrationTest {

    static final UUID CREDIT = UUID.fromString("01920000-0000-7000-8000-000000000704");
    static final UUID FINAL_CONSUMER = UUID.fromString("01920000-0000-7000-8000-000000000601");

    private PosTestSupport pos;

    @BeforeEach
    void setUpPos() {
        pos = new PosTestSupport(api);
    }

    @Test
    void creditSaleWithinLimitPaymentsAndVoids() throws Exception {
        Owned owner = api.newTenant("fiado");
        Session s = owner.tenant();
        UUID item = pos.service(s, "SRV", "10000");
        UUID marta = customer(s, "1001", "Marta", "Gómez", 50000);
        UUID pedro = customer(s, "1002", "Pedro", "Ruiz", 0);
        UUID session = pos.openCash(s, CAJA_1, "0");

        // El medio de pago "Fiado" viene en todo negocio
        api.getWith(s, "/api/v1/payment-methods")
                .andExpect(jsonPath("$[?(@.code == 'CREDIT')].name").value(contains("Fiado")));

        // 30.000: 10.000 en efectivo y 20.000 fiados
        String sale = body(sellCredit(s, marta, item, 3, "10000", "20000").andExpect(status().isCreated()));
        UUID saleId = UUID.fromString(JsonPath.read(sale, "$.id"));
        List<String> codes = JsonPath.read(sale, "$.payments[*].methodCode");
        assertThat(codes).containsExactly("CASH", "CREDIT");
        String account = body(api.getWith(s, "/api/v1/credit/accounts/" + marta).andExpect(status().isOk()));
        assertThat(number(account, "$.balance")).isEqualByComparingTo("20000");
        assertThat(number(account, "$.available")).isEqualByComparingTo("30000");
        assertThat(number(account, "$.upTo30Days")).isEqualByComparingTo("20000");
        assertThat((Object) JsonPath.read(account, "$.oldestDebtAt")).isNotNull();

        // Al Consumidor final, a quien no tiene cupo y con dos líneas de fiado: no
        sellCredit(s, FINAL_CONSUMER, item, 1, null, "10000").andExpect(status().is(422));
        sellCredit(s, pedro, item, 1, null, "10000").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("no tiene cupo")));
        pos.sell(s, """
                {"customerId":"%s","items":[{"productId":"%s","quantity":2}],
                 "payments":[{"paymentMethodId":"%s","amount":10000},{"paymentMethodId":"%s","amount":10000}]}
                """.formatted(marta, item, CREDIT, CREDIT), key()).andExpect(status().is(422));

        // El dueño (credit:manage) sí puede pasar el cupo: 20.000 + 40.000 > 50.000
        sellCredit(s, marta, item, 4, null, "40000").andExpect(status().isCreated());
        String summary = body(api.getWith(s, "/api/v1/credit/summary").andExpect(status().isOk())
                .andExpect(jsonPath("$.customers").value(1))
                .andExpect(jsonPath("$.overLimit").value(1)));
        assertThat(number(summary, "$.totalBalance")).isEqualByComparingTo("60000");

        // Abono en efectivo: entra a la caja; repetir la clave no lo duplica
        String paymentKey = key();
        String payment = body(pay(s, marta, "15000", CASH, null, paymentKey).andExpect(status().isCreated()));
        UUID paymentId = UUID.fromString(JsonPath.read(payment, "$.id"));
        assertThat(number(payment, "$.balanceAfter")).isEqualByComparingTo("45000");
        String again = body(pay(s, marta, "15000", CASH, null, paymentKey).andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(again, "$.id")).isEqualTo(paymentId.toString());

        // No más de lo que debe, ni con "Fiado", ni sin clave
        pay(s, marta, "100000", CASH, null, key()).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("45.000")));
        pay(s, marta, "1000", CREDIT, null, key()).andExpect(status().is(422));
        pay(s, marta, "1000", CASH, null, null).andExpect(status().is(422));
        pay(s, pedro, "1000", CASH, null, key()).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("no debe nada")));

        // Abono por transferencia: no toca el efectivo
        assertThat(amount(pay(s, marta, "5000", TRANSFER, "NEQUI-1", key()).andExpect(status().isCreated()),
                "$.balanceAfter")).isEqualByComparingTo("40000");

        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(number(report, "$.cash.creditPayments")).isEqualByComparingTo("15000");
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("25000");

        // Estado de cuenta: lo más reciente primero, con el saldo después de cada movimiento
        String entries = body(api.getWith(s, "/api/v1/credit/accounts/" + marta + "/entries").andExpect(status().isOk()));
        assertThat(((Number) JsonPath.read(entries, "$.totalElements")).intValue()).isEqualTo(4);
        List<String> types = JsonPath.read(entries, "$.content[*].type");
        assertThat(types).containsExactly("PAYMENT", "PAYMENT", "SALE", "SALE");
        assertThat(number(entries, "$.content[0].balanceAfter")).isEqualByComparingTo("40000");
        assertThat((String) JsonPath.read(entries, "$.content[3].saleNumber")).isEqualTo("POS-1");

        // Anular el abono en efectivo: la deuda sube y el dinero sale de la caja
        api.postWith(s, "/api/v1/credit/payments/" + paymentId + "/void", "{\"reason\":\"\"}")
                .andExpect(status().isBadRequest());
        api.postWith(s, "/api/v1/credit/payments/" + paymentId + "/void", "{\"reason\":\"Se registró dos veces\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.voided").value(true))
                .andExpect(jsonPath("$.voidReason").value("Se registró dos veces"));
        api.postWith(s, "/api/v1/credit/payments/" + paymentId + "/void", "{\"reason\":\"otra vez\"}")
                .andExpect(status().isConflict());
        report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(number(report, "$.cash.creditPayments")).isEqualByComparingTo("0");
        assertThat(amount(api.getWith(s, "/api/v1/credit/accounts/" + marta), "$.balance"))
                .isEqualByComparingTo("55000");

        // Anular la venta fiada: se le descuenta lo fiado y se devuelve el efectivo
        api.postWith(s, "/api/v1/sales/" + saleId + "/void", "{\"reason\":\"Devolvió todo\"}").andExpect(status().isOk());
        assertThat(amount(api.getWith(s, "/api/v1/credit/accounts/" + marta), "$.balance"))
                .isEqualByComparingTo("35000");
        report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(number(report, "$.cash.voidRefunds")).isEqualByComparingTo("-10000");

        // Cartera
        String list = body(api.getWith(s, "/api/v1/credit/accounts").andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].customerId").value(marta.toString())));
        assertThat(number(list, "$.content[0].balance")).isEqualByComparingTo("35000");
        api.getWith(s, "/api/v1/credit/accounts?filter=ALL").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/credit/accounts?search=GÓM").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/credit/accounts?search=1001").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/credit/accounts?search=pedro").andExpect(jsonPath("$.totalElements").value(0));
        api.getWith(s, "/api/v1/credit/accounts/" + UUID.randomUUID()).andExpect(status().isNotFound());
    }

    @Test
    void cashierSellsWithinLimitButOnlyManagersChangeIt() throws Exception {
        Owned owner = api.newTenant("fiado-roles");
        Session s = owner.tenant();
        UUID item = pos.service(s, "SRV", "5000");
        UUID ana = customer(s, "2001", "Ana", "Díaz", 20000);

        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        Session c = cashier.session();
        UUID register = pos.newRegister(s, api.principalBranchId(s), "CAJA-2");
        pos.openCash(c, register, "0");

        sellCredit(c, ana, item, 3, null, "15000").andExpect(status().isCreated());
        sellCredit(c, ana, item, 2, null, "10000").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("5.000")));
        sellCredit(c, ana, item, 2, "5000", "5000").andExpect(status().isCreated());

        // El cajero registra clientes, pero el cupo lo asigna el dueño o un administrador
        api.putWith(c, "/api/v1/customers/" + ana, customerJson("2001", "Ana", "Díaz", 90000))
                .andExpect(status().isForbidden());
        api.putWith(c, "/api/v1/customers/" + ana, customerJson("2001", "Ana Lucía", "Díaz", 20000))
                .andExpect(status().isOk());
        api.putWith(c, "/api/v1/customers/" + ana, """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"2001","firstNames":"Ana",
                 "lastNames":"Díaz"}
                """).andExpect(status().isOk());
        assertThat(amount(api.getWith(s, "/api/v1/customers/" + ana), "$.creditLimit"))
                .isEqualByComparingTo("20000");
        api.postWith(c, "/api/v1/customers", customerJson("2002", "Luis", "Mora", 1000)).andExpect(status().isForbidden());
        api.postWith(c, "/api/v1/customers", customerJson("2002", "Luis", "Mora", 0)).andExpect(status().isCreated());

        // Recibe abonos, pero no los anula
        UUID payment = id(pay(c, ana, "5000", CASH, null, key()).andExpect(status().isCreated()), "$.id");
        api.postWith(c, "/api/v1/credit/payments/" + payment + "/void", "{\"reason\":\"x\"}")
                .andExpect(status().isForbidden());

        // Sin caja abierta no recibe abonos en efectivo (sí por transferencia)
        Joined seller = api.joinAs(s, owner.tenantId(), "SELLER");
        pay(seller.session(), ana, "1000", CASH, null, key()).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("Abre tu caja")));
        pay(seller.session(), ana, "1000", TRANSFER, null, key()).andExpect(status().isCreated());
        api.getWith(seller.session(), "/api/v1/credit/summary").andExpect(status().isOk());

        Session warehouse = api.joinAs(s, owner.tenantId(), "WAREHOUSE").session();
        api.getWith(warehouse, "/api/v1/credit/summary").andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/credit/accounts/" + ana).andExpect(status().isForbidden());
    }

    @Test
    void agingPaysOldestDebtFirst() throws Exception {
        Owned owner = api.newTenant("fiado-edad");
        Session s = owner.tenant();
        UUID item = pos.service(s, "SRV", "10000");
        UUID rosa = customer(s, "3001", "Rosa", "León", 100000);
        pos.openCash(s, CAJA_1, "0");
        UUID old = id(sellCredit(s, rosa, item, 2, null, "20000").andExpect(status().isCreated()), "$.id");
        sellCredit(s, rosa, item, 1, null, "10000").andExpect(status().isCreated());

        // La primera venta fiada fue hace 45 días
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        jdbc.execute("ALTER TABLE " + schema + ".credit_entries DISABLE TRIGGER trg_credit_entries_immutable");
        try {
            jdbc.update("UPDATE " + schema + ".credit_entries SET created_at = now() - interval '45 days'"
                    + " WHERE sale_id = ?", old);
        } finally {
            jdbc.execute("ALTER TABLE " + schema + ".credit_entries ENABLE TRIGGER trg_credit_entries_immutable");
        }

        String account = body(api.getWith(s, "/api/v1/credit/accounts/" + rosa));
        assertThat(number(account, "$.upTo30Days")).isEqualByComparingTo("10000");
        assertThat(number(account, "$.from31To60Days")).isEqualByComparingTo("20000");
        assertThat(number(account, "$.over60Days")).isEqualByComparingTo("0");

        // El abono paga primero lo más viejo: quedan 5.000 de la venta reciente
        pay(s, rosa, "25000", CASH, null, key()).andExpect(status().isCreated());
        account = body(api.getWith(s, "/api/v1/credit/accounts/" + rosa));
        assertThat(number(account, "$.balance")).isEqualByComparingTo("5000");
        assertThat(number(account, "$.upTo30Days")).isEqualByComparingTo("5000");
        assertThat(number(account, "$.from31To60Days")).isEqualByComparingTo("0");
        assertThat(number(account, "$.lastPaymentAmount")).isEqualByComparingTo("25000");
        String summary = body(api.getWith(s, "/api/v1/credit/summary"));
        assertThat(number(summary, "$.upTo30Days")).isEqualByComparingTo("5000");
        assertThat(number(summary, "$.from31To60Days")).isEqualByComparingTo("0");
    }

    // ---------------------------------------------------------------- apoyo

    private UUID customer(Session s, String document, String first, String last, int creditLimit) throws Exception {
        return id(api.postWith(s, "/api/v1/customers", customerJson(document, first, last, creditLimit))
                .andExpect(status().isCreated()), "$.id");
    }

    private static String customerJson(String document, String first, String last, int creditLimit) {
        return """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"%s","firstNames":"%s","lastNames":"%s",
                 "phone":"3001234567","creditLimit":%d}
                """.formatted(document, first, last, creditLimit);
    }

    /** Venta con una parte en efectivo (opcional) y el resto fiado. */
    private ResultActions sellCredit(Session s, UUID customer, UUID item, int quantity, String cash, String credit)
            throws Exception {
        String payments = (cash == null ? "" : "{\"paymentMethodId\":\"%s\",\"amount\":%s},".formatted(CASH, cash))
                + "{\"paymentMethodId\":\"%s\",\"amount\":%s}".formatted(CREDIT, credit);
        return pos.sell(s, """
                {"customerId":"%s","items":[{"productId":"%s","quantity":%d}],"payments":[%s]}
                """.formatted(customer, item, quantity, payments), key());
    }

    private ResultActions pay(Session s, UUID customer, String amount, UUID method, String reference, String key)
            throws Exception {
        String json = """
                {"amount":%s,"paymentMethodId":"%s"%s}
                """.formatted(amount, method, reference == null ? "" : ",\"reference\":\"" + reference + "\"");
        String path = "/api/v1/credit/accounts/" + customer + "/payments";
        return key == null ? api.postWith(s, path, json) : api.postWithHeaders(s, path, json, "Idempotency-Key", key);
    }

    private static BigDecimal amount(ResultActions result, String path) throws Exception {
        return number(body(result), path);
    }
}
