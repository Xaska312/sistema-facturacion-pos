package com.poshibrido.finance;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.TRANSFER;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Estado de resultados (Finanzas parte C, decisión 323). */
class IncomeStatementIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Bogota"));
    private static final String RENT = "01920000-0000-7000-8000-000000000a01";
    private static final String UTILITIES = "01920000-0000-7000-8000-000000000a02";

    @Test
    void salesCostExpensesAndProfit() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("resultados");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        // Producto de $119.000 con IVA incluido (base $100.000) que costó $60.000.
        UUID product = pos.productWithStock(s, "SILLA", "119000", "10", "60000");
        pos.openCash(s, CAJA_1, "0");
        pos.sell(s, """
                {"items":[{"productId":"%s","quantity":3}],"payments":[{"paymentMethodId":"%s","amount":357000,
                 "reference":"T"}]}""".formatted(product, TRANSFER), key()).andExpect(status().isCreated());
        // Gastos: arriendo $100.000 y servicios $20.000.
        expense(s, "100000", RENT, branch);
        expense(s, "20000", UTILITIES, branch);
        // Un gasto fijo del mes sin pagar se avisa, no se resta.
        api.postWith(s, "/api/v1/recurring-expenses", """
                {"name":"Internet","categoryId":"%s","branchId":"%s","paymentMethodId":"%s","amount":90000,
                 "frequency":"MONTHLY","dayOfMonth":%d,"startsOn":"%s"}
                """.formatted(UTILITIES, branch, TRANSFER, TODAY.getDayOfMonth(), TODAY))
                .andExpect(status().isCreated());

        api.getWith(cashier, "/api/v1/finance/income-statement").andExpect(status().isForbidden());
        String r = body(api.getWith(s, "/api/v1/finance/income-statement").andExpect(status().isOk()));
        assertThat((String) JsonPath.read(r, "$.current.from")).isEqualTo(TODAY.withDayOfMonth(1).toString());
        assertThat(number(r, "$.current.salesTotal")).isEqualByComparingTo("357000");
        assertThat(number(r, "$.current.tax")).isEqualByComparingTo("57000");
        assertThat(number(r, "$.current.netSales")).isEqualByComparingTo("300000");
        assertThat(number(r, "$.current.cost")).isEqualByComparingTo("180000");
        assertThat(number(r, "$.current.grossProfit")).isEqualByComparingTo("120000");
        assertThat(number(r, "$.current.grossMargin")).isEqualByComparingTo("40.0");
        assertThat(number(r, "$.current.expensesTotal")).isEqualByComparingTo("120000");
        assertThat((String) JsonPath.read(r, "$.current.expenses[0].name")).isEqualTo("Arriendo");
        assertThat(number(r, "$.current.operatingProfit")).isEqualByComparingTo("0");
        assertThat(number(r, "$.current.withheld")).isEqualByComparingTo("0");
        assertThat((Integer) JsonPath.read(r, "$.unpaidRecurring.count")).isEqualTo(1);
        assertThat(number(r, "$.unpaidRecurring.total")).isEqualByComparingTo("90000");
        // Sin datos en el periodo anterior ni el año pasado.
        assertThat((Object) JsonPath.read(r, "$.previous")).isNull();
        assertThat((Object) JsonPath.read(r, "$.lastYear")).isNull();

        // Por sede: las retenciones no se muestran (las de pedidos no tienen sede).
        api.getWith(s, "/api/v1/finance/income-statement?branchId=" + branch).andExpect(status().isOk())
                .andExpect(jsonPath("$.current.withheld").doesNotExist())
                .andExpect(jsonPath("$.branchName").isNotEmpty());
        api.getWith(s, "/api/v1/finance/income-statement?from=" + TODAY + "&to=" + TODAY.minusDays(1))
                .andExpect(status().is(422));
        api.getWith(s, "/api/v1/finance/income-statement?from=" + TODAY.minusYears(2) + "&to=" + TODAY)
                .andExpect(status().is(422));

        String csv = new String(api.getWith(s, "/api/v1/finance/income-statement.csv").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(csv).contains("Ventas netas (sin impuestos);300000").contains("Gasto: Arriendo;100000")
                .contains("Utilidad operativa;0").contains("Gastos fijos del periodo sin pagar");
    }

    private void expense(Session s, String amount, String category, UUID branch) throws Exception {
        api.postWith(s, "/api/v1/expenses", """
                {"amount":%s,"categoryId":"%s","paymentMethodId":"%s","branchId":"%s"}
                """.formatted(amount, category, TRANSFER, branch)).andExpect(status().isCreated());
    }
}
