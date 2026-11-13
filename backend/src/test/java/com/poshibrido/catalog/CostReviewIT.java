package com.poshibrido.catalog;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Revisar y corregir costos escritos con IVA (decisión 349). */
class CostReviewIT extends IntegrationTest {

    @Test
    void removesTaxFromCostAndPastSales() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("costos-iva");
        Session s = owner.tenant();
        // La leche del cliente: le cuesta 5.650 con IVA y la vende en 6.800 con IVA; el costo se escribió con IVA
        UUID milk = pos.productWithStock(s, "LECHE", "6800", "5", "5650");
        pos.openCash(s, CAJA_1, "0");
        pos.sellCash(s, milk, "1", "6800").andExpect(status().isCreated());

        String summary = body(api.getWith(s, "/api/v1/reports/sales/summary"));
        assertThat(number(summary, "$.profit")).isEqualByComparingTo("64.29");

        String review = body(api.getWith(s, "/api/v1/products/cost-review").andExpect(status().isOk()));
        List<Object> rows = JsonPath.read(review, "$[?(@.sku == 'LECHE')]");
        assertThat(rows).hasSize(1);
        assertThat(first(review, "$[?(@.sku == 'LECHE')].costWithoutTax")).isEqualByComparingTo("4747.90");
        assertThat(first(review, "$[?(@.sku == 'LECHE')].marginNow")).isEqualByComparingTo("1.1");
        assertThat(first(review, "$[?(@.sku == 'LECHE')].marginFixed")).isEqualByComparingTo("16.9");
        assertThat(JsonPath.<List<Boolean>>read(review, "$[?(@.sku == 'LECHE')].suspicious")).containsExactly(true);

        // Fuera de la corrección las líneas de venta siguen inmutables
        assertThatThrownBy(() -> jdbc.update("UPDATE t_" + owner.slug() + ".sale_items SET unit_cost = 1"))
                .hasMessageContaining("inmutables");

        api.postWith(s, "/api/v1/products/cost-review/remove-tax", """
                {"productIds":["%s"]}
                """.formatted(milk)).andExpect(status().isOk())
                .andExpect(jsonPath("$.products").value(1))
                .andExpect(jsonPath("$.saleLines").value(1));

        assertThat(number(body(api.getWith(s, "/api/v1/products/" + milk)), "$.cost")).isEqualByComparingTo("4747.90");
        assertThat(number(body(api.getWith(s, "/api/v1/reports/sales/summary")), "$.profit"))
                .isEqualByComparingTo("966.39");
        assertThat(JsonPath.<List<String>>read(body(api.getWith(s, "/api/v1/inventory/kardex?productId=" + milk
                + "&branchId=" + api.principalBranchId(s))), "$.content[*].type")).contains("COST_CHANGE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM t_" + owner.slug()
                + ".audit_log WHERE action = 'PRODUCT_COST_TAX_REMOVED'", Integer.class)).isEqualTo(1);

        // Sin productos elegidos no hace nada; sin permiso de productos, no entra
        api.postWith(s, "/api/v1/products/cost-review/remove-tax", "{\"productIds\":[]}")
                .andExpect(status().isBadRequest());
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        api.getWith(cashier, "/api/v1/products/cost-review").andExpect(status().isForbidden());
    }

    private static BigDecimal first(String json, String path) {
        List<Object> values = JsonPath.read(json, path);
        return new BigDecimal(String.valueOf(values.get(0)));
    }
}
