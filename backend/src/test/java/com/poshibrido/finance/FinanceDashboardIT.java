package com.poshibrido.finance;

import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.TRANSFER;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Tablero de Finanzas (parte D, decisión 324). */
class FinanceDashboardIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Bogota"));
    private static final String RENT = "01920000-0000-7000-8000-000000000a01";

    @Test
    void flowBalancesExpensesAndBreakEven() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("tablero");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        // Producto de $119.000 (base $100.000) que costó $60.000: margen bruto 40 %.
        UUID product = pos.productWithStock(s, "MESA", "119000", "20", "60000");
        pos.openCash(s, CAJA_1, "100000");
        pos.sell(s, """
                {"items":[{"productId":"%s","quantity":2}],"payments":[{"paymentMethodId":"%s","amount":238000}]}
                """.formatted(product, CASH), key()).andExpect(status().isCreated());
        pos.sell(s, """
                {"items":[{"productId":"%s","quantity":1}],"payments":[{"paymentMethodId":"%s","amount":119000,
                 "reference":"T"}]}""".formatted(product, TRANSFER), key()).andExpect(status().isCreated());
        // Gasto por transferencia de $30.000 y gasto fijo mensual de $600.000 (sin gastos del mes pasado).
        api.postWith(s, "/api/v1/expenses", """
                {"amount":30000,"categoryId":"%s","paymentMethodId":"%s","branchId":"%s"}
                """.formatted(RENT, TRANSFER, branch)).andExpect(status().isCreated());
        api.postWith(s, "/api/v1/recurring-expenses", """
                {"name":"Arriendo","categoryId":"%s","branchId":"%s","paymentMethodId":"%s","amount":600000,
                 "frequency":"MONTHLY","dayOfMonth":%d,"startsOn":"%s"}
                """.formatted(RENT, branch, TRANSFER, TODAY.getDayOfMonth(), TODAY)).andExpect(status().isCreated());

        api.getWith(cashier, "/api/v1/finance/dashboard").andExpect(status().isForbidden());
        String d = body(api.getWith(s, "/api/v1/finance/dashboard").andExpect(status().isOk()));
        assertThat(number(d, "$.netSales")).isEqualByComparingTo("300000");
        assertThat(number(d, "$.grossProfit")).isEqualByComparingTo("120000");
        assertThat(number(d, "$.operatingProfit")).isEqualByComparingTo("90000");
        // Plata: entró 238.000 en efectivo y 119.000 por transferencia; salió 30.000 por transferencia.
        assertThat(number(d, "$.flow.in")).isEqualByComparingTo("357000");
        assertThat(number(d, "$.flow.out")).isEqualByComparingTo("30000");
        assertThat(first(d, "$.flow.byMethod[?(@.name == 'Efectivo')].in")).isEqualByComparingTo("238000");
        assertThat(first(d, "$.flow.byMethod[?(@.paymentMethodId == '01920000-0000-7000-8000-000000000703')].net")).isEqualByComparingTo("89000");
        assertThat(number(d, "$.balances.creditOwed")).isEqualByComparingTo("0");
        assertThat(number(d, "$.balances.suppliersOwed")).isEqualByComparingTo("0");
        assertThat(number(d, "$.expenses.thisMonth")).isEqualByComparingTo("30000");
        assertThat(number(d, "$.expenses.unpaidRecurringTotal")).isEqualByComparingTo("600000");
        // Equilibrio con los gastos fijos: 600.000 ÷ 40 % = 1.500.000 al mes.
        assertThat((String) com.jayway.jsonpath.JsonPath.read(d, "$.breakEven.basis")).isEqualTo("RECURRING");
        assertThat(number(d, "$.breakEven.grossMargin")).isEqualByComparingTo("40.0");
        assertThat(number(d, "$.breakEven.perMonth")).isEqualByComparingTo("1500000");
        assertThat(number(d, "$.breakEven.perDay")).isEqualByComparingTo(
                new java.math.BigDecimal(1500000).divide(java.math.BigDecimal.valueOf(TODAY.lengthOfMonth()), 0,
                        java.math.RoundingMode.HALF_UP));
    }

    private static java.math.BigDecimal first(String json, String path) {
        java.util.List<Object> values = com.jayway.jsonpath.JsonPath.read(json, path);
        return new java.math.BigDecimal(String.valueOf(values.getFirst()));
    }
}
