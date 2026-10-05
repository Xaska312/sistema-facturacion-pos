package com.poshibrido.reporting;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CARD;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.TRANSFER;
import static com.poshibrido.sales.PosTestSupport.UND;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Reportes sobre un escenario conocido. Ventas registradas (IVA incluido en el precio):
 * <pre>
 *  1. Gaseosa ×2 (IVA 19)  efectivo      4.000  base  3.361,34  costo 2.000   [dueño, sede principal]
 *  2. Café ×1 (IVA 5)      tarjeta      10.500  base 10.000,00  costo 6.000   [dueño, sede principal]
 *  3. Domicilio ×1 (IVA 19) transfer.    5.000  base  4.201,68  costo     0   [dueño, sede principal]
 *  4. Gaseosa ×1           efectivo      2.000  → anulada
 *  5. Gaseosa ×1           efectivo      2.000  base  1.680,67  costo 1.000   [cajero, sede principal]
 *  6. Domicilio ×2         efectivo     10.000  base  8.403,36  costo     0   [dueño, sede Norte]
 * </pre>
 * Totales: 5 ventas, 31.500, base 27.647,05, impuestos 3.852,95, costo 9.000, utilidad 18.647,05 (67,45 %).
 */
class ReportsIT extends IntegrationTest {

    private static final UUID IVA19 = UUID.fromString("01920000-0000-7000-8000-000000000401");
    private static final UUID IVA5 = UUID.fromString("01920000-0000-7000-8000-000000000402");

    @Test
    void reportsMatchTheRegisteredSales() throws Exception {
        Scenario sc = scenario("rep");
        Session s = sc.owner().tenant();

        String summary = body(api.getWith(s, "/api/v1/reports/sales/summary").andExpect(status().isOk()));
        assertThat(((Number) JsonPath.read(summary, "$.salesCount")).intValue()).isEqualTo(5);
        assertThat(number(summary, "$.total")).isEqualByComparingTo("31500");
        assertThat(number(summary, "$.subtotal")).isEqualByComparingTo("27647.05");
        assertThat(number(summary, "$.taxTotal")).isEqualByComparingTo("3852.95");
        assertThat(number(summary, "$.cost")).isEqualByComparingTo("9000");
        assertThat(number(summary, "$.profit")).isEqualByComparingTo("18647.05");
        assertThat(number(summary, "$.marginPercent")).isEqualByComparingTo("67.45");
        assertThat(number(summary, "$.averageTicket")).isEqualByComparingTo("6300");
        assertThat(((Number) JsonPath.read(summary, "$.voidedCount")).intValue()).isEqualTo(1);
        assertThat(number(summary, "$.voidedTotal")).isEqualByComparingTo("2000");

        // Filtros por sucursal y vendedor
        String north = body(api.getWith(s, "/api/v1/reports/sales/summary?branchId=" + sc.north()));
        assertThat(((Number) JsonPath.read(north, "$.salesCount")).intValue()).isEqualTo(1);
        assertThat(number(north, "$.total")).isEqualByComparingTo("10000");
        String cashierOnly = body(api.getWith(s, "/api/v1/reports/sales/summary?sellerId=" + sc.cashier().userId()));
        assertThat(number(cashierOnly, "$.total")).isEqualByComparingTo("2000");

        // Por día, sucursal, vendedor y medio de pago
        String byDay = body(api.getWith(s, "/api/v1/reports/sales/by-day").andExpect(status().isOk()));
        assertThat((String) JsonPath.read(byDay, "$[0].key")).isEqualTo(today().toString());
        assertThat(number(byDay, "$[0].total")).isEqualByComparingTo("31500");
        List<String> branches = JsonPath.read(body(api.getWith(s, "/api/v1/reports/sales/by-branch")), "$[*].label");
        assertThat(branches).containsExactly("Sede principal", "Sede Norte");
        List<Map<String, Object>> sellers = JsonPath.read(body(api.getWith(s, "/api/v1/reports/sales/by-seller")), "$");
        assertThat(sellers).hasSize(2);
        String methods = body(api.getWith(s, "/api/v1/reports/sales/by-payment-method"));
        assertThat((List<String>) JsonPath.read(methods, "$[*].code")).containsExactly("CASH", "CARD", "TRANSFER");
        assertThat(number(methods, "$[0].amount")).isEqualByComparingTo("16000");
        assertThat(number(methods, "$[1].amount")).isEqualByComparingTo("10500");

        // Productos, categorías e impuestos
        String products = body(api.getWith(s, "/api/v1/reports/products"));
        assertThat((List<String>) JsonPath.read(products, "$[*].sku")).containsExactly("DOM", "CAFE", "GAS");
        assertThat(number(products, "$[0].total")).isEqualByComparingTo("15000");
        assertThat(number(products, "$[2].quantity")).isEqualByComparingTo("3");
        assertThat(number(products, "$[2].profit")).isEqualByComparingTo("2042.01"); // 5.042,01 − 3.000
        String byQuantity = body(api.getWith(s, "/api/v1/reports/products?orderBy=quantity&limit=1"));
        assertThat((List<String>) JsonPath.read(byQuantity, "$[*].sku")).hasSize(1);
        String categories = body(api.getWith(s, "/api/v1/reports/categories"));
        assertThat((List<String>) JsonPath.read(categories, "$[*].categoryName")).containsExactly("Sin categoría");
        String taxes = body(api.getWith(s, "/api/v1/reports/taxes"));
        assertThat(number(taxes, "$[0].taxRate")).isEqualByComparingTo("19");
        assertThat(number(taxes, "$[0].taxableBase")).isEqualByComparingTo("17647.05");
        assertThat(number(taxes, "$[0].taxAmount")).isEqualByComparingTo("3352.95");
        assertThat(((Number) JsonPath.read(taxes, "$[0].salesCount")).intValue()).isEqualTo(4);
        assertThat(number(taxes, "$[1].taxAmount")).isEqualByComparingTo("500");

        // Inventario valorizado: gaseosa 47 × 1.000 + café 9 × 6.000
        String valuation = body(api.getWith(s, "/api/v1/reports/inventory/valuation"));
        assertThat(number(valuation, "$.totalValue")).isEqualByComparingTo("101000");
        assertThat(((Number) JsonPath.read(valuation, "$.productCount")).intValue()).isEqualTo(2);

        // Tablero y "mis ventas de hoy"
        String dashboard = body(api.getWith(s, "/api/v1/reports/dashboard").andExpect(status().isOk()));
        assertThat(number(dashboard, "$.today.total")).isEqualByComparingTo("31500");
        assertThat((List<Object>) JsonPath.read(dashboard, "$.byHour")).hasSize(24);
        assertThat((List<Object>) JsonPath.read(dashboard, "$.last7Days")).hasSize(7);
        assertThat(number(dashboard, "$.last7Days[6].total")).isEqualByComparingTo("31500");
        assertThat((List<Object>) JsonPath.read(dashboard, "$.topProducts")).hasSize(3);
        String myDay = body(api.getWith(sc.cashier().session(), "/api/v1/reports/my-day").andExpect(status().isOk()));
        assertThat(((Number) JsonPath.read(myDay, "$.salesCount")).intValue()).isEqualTo(1);
        assertThat(number(myDay, "$.total")).isEqualByComparingTo("2000");
    }

    @Test
    void csvExportsAreReadyForExcelInSpanish() throws Exception {
        Scenario sc = scenario("repcsv");
        Session s = sc.owner().tenant();

        MockHttpServletResponse response = api.getWith(s, "/api/v1/reports/sales.csv").andExpect(status().isOk())
                .andReturn().getResponse();
        assertThat(response.getContentType()).startsWith("text/csv");
        assertThat(response.getHeader("Content-Disposition")).contains("attachment").contains("ventas_");
        byte[] bytes = response.getContentAsByteArray();
        assertThat(bytes[0]).isEqualTo((byte) 0xEF);
        assertThat(bytes[1]).isEqualTo((byte) 0xBB);
        assertThat(bytes[2]).isEqualTo((byte) 0xBF);
        String csv = new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
        String[] lines = csv.split("\r\n");
        assertThat(lines[0]).startsWith("Número;Fecha;Estado;Sucursal");
        assertThat(lines).hasSize(7);
        assertThat(csv).contains("POS-1;").contains(";Anulada;").contains(";3361,34;").contains("Efectivo");

        for (String path : List.of("/sales/by-day.csv", "/sales/by-branch.csv", "/sales/by-seller.csv",
                "/sales/by-payment-method.csv", "/products.csv", "/categories.csv", "/taxes.csv",
                "/inventory/valuation.csv")) {
            String content = new String(api.getWith(s, "/api/v1/reports" + path).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
            assertThat(content).as(path).contains(";");
        }
        String taxes = new String(api.getWith(s, "/api/v1/reports/taxes.csv").andReturn().getResponse()
                .getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(taxes).contains("IVA;19;4;17647,05;3352,95");
    }

    @Test
    void periodValidationPermissionsAndIsolation() throws Exception {
        Scenario sc = scenario("repperm");
        Session s = sc.owner().tenant();

        api.getWith(s, "/api/v1/reports/sales/summary?from=2026-02-10&to=2026-02-01").andExpect(status().is(422));
        api.getWith(s, "/api/v1/reports/sales/summary?from=2024-01-01&to=2026-01-01").andExpect(status().is(422));
        String empty = body(api.getWith(s, "/api/v1/reports/sales/summary?from=2020-01-01&to=2020-01-31"));
        assertThat(((Number) JsonPath.read(empty, "$.salesCount")).intValue()).isZero();
        assertThat(number(empty, "$.averageTicket")).isEqualByComparingTo("0");

        // Cajero: solo sus ventas del día; sin reportes del negocio
        Session cashier = sc.cashier().session();
        api.getWith(cashier, "/api/v1/reports/sales/summary").andExpect(status().isForbidden());
        api.getWith(cashier, "/api/v1/reports/dashboard").andExpect(status().isForbidden());
        api.getWith(cashier, "/api/v1/reports/sales.csv").andExpect(status().isForbidden());
        api.getWith(cashier, "/api/v1/reports/inventory/valuation").andExpect(status().isForbidden());
        // Bodeguero: tampoco ve sus ventas (no tiene sales:read)
        Session warehouse = api.joinAs(s, sc.owner().tenantId(), "WAREHOUSE").session();
        api.getWith(warehouse, "/api/v1/reports/my-day").andExpect(status().isForbidden());
        // Contador: ve los reportes
        Session accountant = api.joinAs(s, sc.owner().tenantId(), "ACCOUNTANT").session();
        api.getWith(accountant, "/api/v1/reports/sales/summary").andExpect(status().isOk());
        api.getWith(accountant, "/api/v1/reports/products.csv").andExpect(status().isOk());

        // Otro negocio no ve nada de este; un token sin negocio recibe 403
        Owned other = api.newTenant("repotro");
        String otherSummary = body(api.getWith(other.tenant(), "/api/v1/reports/sales/summary"));
        assertThat(((Number) JsonPath.read(otherSummary, "$.salesCount")).intValue()).isZero();
        String otherValuation = body(api.getWith(other.tenant(), "/api/v1/reports/inventory/valuation"));
        assertThat(number(otherValuation, "$.totalValue")).isEqualByComparingTo("0");
        api.getWith(sc.owner().platform(), "/api/v1/reports/sales/summary").andExpect(status().isForbidden());
    }

    // ---------------------------------------------------------------- escenario

    private record Scenario(Owned owner, Joined cashier, UUID north) {
    }

    private Scenario scenario(String prefix) throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant(prefix);
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID soda = product(s, "GAS", "Gaseosa", IVA19, "2000", true);
        UUID coffee = product(s, "CAFE", "Café", IVA5, "10500", true);
        UUID delivery = product(s, "DOM", "Domicilio", IVA19, "5000", false);
        api.postWith(s, "/api/v1/inventory/initial-balances", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":50,"unitCost":1000},
                                          {"productId":"%s","quantity":10,"unitCost":6000}]}
                """.formatted(principal, soda, coffee)).andExpect(status().isCreated());

        UUID session = pos.openCash(s, CAJA_1, "0");
        sell(pos, s, soda, "2", CASH, "4000");
        sell(pos, s, coffee, "1", CARD, "10500");
        sell(pos, s, delivery, "1", TRANSFER, "5000");
        UUID voided = id(sell(pos, s, soda, "1", CASH, "2000"), "$.id");
        api.postWith(s, "/api/v1/sales/" + voided + "/void", "{\"reason\":\"Prueba\"}").andExpect(status().isOk());

        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        UUID caja2 = pos.newRegister(s, principal, "CAJA-2");
        pos.openCash(cashier.session(), caja2, "0");
        sell(pos, cashier.session(), soda, "1", CASH, "2000");

        pos.close(s, session, "0").andExpect(status().isOk());
        UUID north = id(api.postWith(s, "/api/v1/branches", """
                {"code":"NORTE","name":"Sede Norte"}
                """).andExpect(status().isCreated()), "$.id");
        pos.openCash(s, pos.newRegister(s, north, "CAJA-N"), "0");
        sell(pos, s, delivery, "2", CASH, "10000");
        return new Scenario(owner, cashier, north);
    }

    private UUID product(Session s, String sku, String name, UUID taxId, String price, boolean tracked) throws Exception {
        return id(api.postWith(s, "/api/v1/products", """
                {"sku":"%s","name":"%s","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":%s,"trackInventory":%s}
                """.formatted(sku, name, UND, taxId, price, tracked)).andExpect(status().isCreated()), "$.id");
    }

    private static org.springframework.test.web.servlet.ResultActions sell(PosTestSupport pos, Session s, UUID product,
                                                                           String quantity, UUID method, String amount)
            throws Exception {
        return pos.sell(s, """
                {"items":[{"productId":"%s","quantity":%s}],"payments":[{"paymentMethodId":"%s","amount":%s}]}
                """.formatted(product, quantity, method, amount), key()).andExpect(status().isCreated());
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("America/Bogota"));
    }
}
