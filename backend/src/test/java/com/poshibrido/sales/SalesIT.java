package com.poshibrido.sales;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CARD;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.CJ;
import static com.poshibrido.sales.PosTestSupport.IVA19;
import static com.poshibrido.sales.PosTestSupport.TRANSFER;
import static com.poshibrido.sales.PosTestSupport.UND;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static com.poshibrido.sales.PosTestSupport.problemPath;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SalesIT extends IntegrationTest {

    private PosTestSupport pos;

    @BeforeEach
    void setUpPos() {
        pos = new PosTestSupport(api);
    }

    @Test
    void saleUpdatesStockCashAndNumbering() throws Exception {
        Owned owner = api.newTenant("venta");
        Session s = owner.tenant();
        UUID soda = pos.productWithStock(s, "GAS", "2000", "10", "1000");
        UUID service = pos.service(s, "ENVIO", "5000");
        UUID boxed = boxedProduct(s, "AGUA", 12, "1500");
        api.postWith(s, "/api/v1/inventory/initial-balances", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":48,"unitCost":800}]}
                """.formatted(api.principalBranchId(s), boxed)).andExpect(status().isCreated());

        // Sin caja abierta no se vende
        pos.sellCash(s, soda, "1", "2000").andExpect(status().is(422));
        UUID session = pos.openCash(s, CAJA_1, "50000");

        // 2 gaseosas a 2.000 (IVA incluido), paga 10.000 en efectivo
        String first = body(pos.sell(s, """
                {"items":[{"productId":"%s","quantity":2,"unitPrice":2000}],"expectedTotal":4000,
                 "payments":[{"paymentMethodId":"%s","amount":10000}]}
                """.formatted(soda, CASH), key()).andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(first, "$.documentNumber")).isEqualTo("POS-1");
        assertThat((String) JsonPath.read(first, "$.status")).isEqualTo("COMPLETED");
        assertThat((String) JsonPath.read(first, "$.customerName")).isEqualTo("Consumidor Final");
        assertThat(number(first, "$.total")).isEqualByComparingTo("4000");
        assertThat(number(first, "$.subtotal")).isEqualByComparingTo("3361.34");
        assertThat(number(first, "$.taxTotal")).isEqualByComparingTo("638.66");
        assertThat(number(first, "$.changeAmount")).isEqualByComparingTo("6000");
        assertThat(number(first, "$.payments[0].amount")).isEqualByComparingTo("4000");
        assertThat(number(first, "$.payments[0].tendered")).isEqualByComparingTo("10000");
        assertThat(number(first, "$.taxes[0].taxAmount")).isEqualByComparingTo("638.66");
        assertThat((String) JsonPath.read(first, "$.receipt.registerCode")).isEqualTo("CAJA-1");
        assertThat(pos.stock(s, soda)).isEqualByComparingTo("8");

        // Pago mixto: 1 caja de agua (12 × 1.500 = 18.000), 1 gaseosa y un servicio = 25.000;
        // tarjeta 20.000 + efectivo 10.000 → cambio 5.000
        String second = body(pos.sell(s, """
                {"items":[{"productId":"%s","unitId":"%s","quantity":1},{"productId":"%s","quantity":1},
                          {"productId":"%s","quantity":1}],
                 "payments":[{"paymentMethodId":"%s","amount":20000,"reference":"APR-1"},
                             {"paymentMethodId":"%s","amount":10000}]}
                """.formatted(boxed, CJ, soda, service, CARD, CASH), key()).andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(second, "$.documentNumber")).isEqualTo("POS-2");
        assertThat(number(second, "$.total")).isEqualByComparingTo("25000");
        assertThat(number(second, "$.changeAmount")).isEqualByComparingTo("5000");
        assertThat(number(second, "$.payments[1].amount")).isEqualByComparingTo("5000");
        assertThat(pos.stock(s, boxed)).isEqualByComparingTo("36");
        assertThat(pos.stock(s, soda)).isEqualByComparingTo("7");

        // Kardex: la venta sale con su costo promedio y saldo resultante
        String kardex = body(api.getWith(s, "/api/v1/inventory/kardex?productId=" + soda).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(kardex, "$.content[0].type")).isEqualTo("SALE");
        assertThat(number(kardex, "$.content[0].balanceAfter")).isEqualByComparingTo("7");
        api.getWith(s, "/api/v1/inventory/consistency").andExpect(jsonPath("$.consistent").value(true));

        // Informe parcial: efectivo = 50.000 + 4.000 + 5.000
        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report").andExpect(status().isOk()));
        assertThat(((Number) JsonPath.read(report, "$.salesCount")).intValue()).isEqualTo(2);
        assertThat(number(report, "$.salesTotal")).isEqualByComparingTo("29000");
        assertThat(number(report, "$.cash.sales")).isEqualByComparingTo("9000");
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("59000");
        List<Map<String, Object>> byMethod = JsonPath.read(report, "$.byMethod");
        assertThat(byMethod).extracting(m -> m.get("code")).containsExactlyInAnyOrder("CASH", "CARD");

        // Historial y detalle
        api.getWith(s, "/api/v1/sales?search=POS-2").andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].number").value(2));
        UUID secondId = UUID.fromString(JsonPath.read(second, "$.id"));
        api.getWith(s, "/api/v1/sales/" + secondId).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3));

        // Sin huecos: la siguiente venta es la 3
        pos.sellCash(s, service, "1", "5000").andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(3));
    }

    @Test
    void serverRecalculatesPricesAndAppliesDiscountRules() throws Exception {
        Owned owner = api.newTenant("precio");
        Session s = owner.tenant();
        UUID product = pos.productWithStock(s, "P1", "10000", "20", "5000");
        pos.openCash(s, CAJA_1, "0");

        // El cliente envió un precio viejo → 409 con el detalle
        String conflict = body(pos.sell(s, """
                {"items":[{"productId":"%s","quantity":1,"unitPrice":9000}],
                 "payments":[{"paymentMethodId":"%s","amount":10000}]}
                """.formatted(product, CASH), key()).andExpect(status().isConflict()));
        assertThat(number(conflict, problemPath(conflict, "changes[0].currentPrice"))).isEqualByComparingTo("10000");
        assertThat(number(conflict, problemPath(conflict, "currentTotal"))).isEqualByComparingTo("10000");
        pos.sell(s, """
                {"items":[{"productId":"%s","quantity":1}],"expectedTotal":9999,
                 "payments":[{"paymentMethodId":"%s","amount":10000}]}
                """.formatted(product, CASH), key()).andExpect(status().isConflict());

        // Descuento del 10 % (el dueño tiene sales:discount): total 9.000
        String discounted = body(pos.sell(s, """
                {"items":[{"productId":"%s","quantity":1,"discountPercent":10}],"expectedTotal":9000,
                 "payments":[{"paymentMethodId":"%s","amount":9000}]}
                """.formatted(product, TRANSFER), key()).andExpect(status().isCreated()));
        assertThat(number(discounted, "$.discountTotal")).isEqualByComparingTo("1000");

        // Un cajero sin sales:discount no supera el límite (0 % por defecto)
        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        UUID register = pos.newRegister(s, api.principalBranchId(s), "CAJA-2");
        pos.openCash(cashier.session(), register, "0");
        pos.sell(cashier.session(), """
                {"items":[{"productId":"%s","quantity":1,"discountPercent":5}],
                 "payments":[{"paymentMethodId":"%s","amount":9500}]}
                """.formatted(product, CASH), key()).andExpect(status().isForbidden());
        pos.sellCash(cashier.session(), product, "1", "10000").andExpect(status().isCreated());

        // Precios sin IVA: el impuesto se suma
        api.putWith(s, "/api/v1/settings", """
                {"allowNegativeStock":false,"pricesIncludeTax":false,"timezone":"America/Bogota","currency":"COP",
                 "receiptFooter":"Gracias","maxDiscountPercent":5}
                """).andExpect(status().isOk());
        String excluded = body(pos.sellCash(s, product, "1", "11900").andExpect(status().isCreated()));
        assertThat(number(excluded, "$.subtotal")).isEqualByComparingTo("10000");
        assertThat(number(excluded, "$.taxTotal")).isEqualByComparingTo("1900");
        assertThat(number(excluded, "$.total")).isEqualByComparingTo("11900");
        // Ahora el límite es 5 %: el cajero puede dar 5 %
        pos.sell(cashier.session(), """
                {"items":[{"productId":"%s","quantity":1,"discountPercent":5}],
                 "payments":[{"paymentMethodId":"%s","amount":11305}]}
                """.formatted(product, CASH), key()).andExpect(status().isCreated());
    }

    @Test
    void paymentAndItemValidation() throws Exception {
        Owned owner = api.newTenant("pagos");
        Session s = owner.tenant();
        UUID product = pos.productWithStock(s, "P1", "1000", "5", "500");
        pos.openCash(s, CAJA_1, "0");
        String item = """
                {"items":[{"productId":"%s","quantity":1}],"payments":[{"paymentMethodId":"%s","amount":%s}]}
                """;
        pos.sell(s, item.formatted(product, CARD, "1500"), key()).andExpect(status().is(422));
        pos.sell(s, item.formatted(product, CASH, "900"), key()).andExpect(status().is(422));
        pos.sell(s, item.formatted(product, UUID.randomUUID(), "1000"), key()).andExpect(status().is(422));
        // Pagos en pesos enteros (QA DIN-2): con centavos, 400 con el campo
        pos.sell(s, item.formatted(product, CASH, "1000.50"), key()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$..field", org.hamcrest.Matchers.hasItem("payments[0].amount")));
        pos.sell(s, item.formatted(product, CASH, "1000"), null).andExpect(status().is(422));
        pos.sell(s, item.formatted(product, CASH, "1000"), "corta").andExpect(status().is(422));
        pos.sell(s, item.formatted(UUID.randomUUID(), CASH, "1000"), key()).andExpect(status().isNotFound());
        pos.sell(s, """
                {"items":[{"productId":"%s","quantity":1.5}],"payments":[{"paymentMethodId":"%s","amount":2000}]}
                """.formatted(product, CASH), key()).andExpect(status().is(422));
        pos.sell(s, """
                {"items":[],"payments":[{"paymentMethodId":"%s","amount":2000}]}
                """.formatted(CASH), key()).andExpect(status().isBadRequest());
        pos.sell(s, """
                {"customerId":"%s","items":[{"productId":"%s","quantity":1}],
                 "payments":[{"paymentMethodId":"%s","amount":1000}]}
                """.formatted(UUID.randomUUID(), product, CASH), key()).andExpect(status().isNotFound());
        // Sin existencias suficientes: 422 con producto y disponible
        String insufficient = body(pos.sellCash(s, product, "6", "6000").andExpect(status().is(422)));
        assertThat((String) JsonPath.read(insufficient, "$.detail")).contains("Producto P1").contains("disponible 5");
        assertThat(pos.stock(s, product)).isEqualByComparingTo("5");
        api.getWith(s, "/api/v1/sales").andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void sameIdempotencyKeyCreatesOneSale() throws Exception {
        Owned owner = api.newTenant("idem");
        Session s = owner.tenant();
        UUID product = pos.productWithStock(s, "P1", "1000", "10", "500");
        UUID session = pos.openCash(s, CAJA_1, "0");
        String json = """
                {"items":[{"productId":"%s","quantity":1}],"payments":[{"paymentMethodId":"%s","amount":1000}]}
                """.formatted(product, CASH);
        String key = key();
        UUID first = id(pos.sell(s, json, key).andExpect(status().isCreated()), "$.id");
        UUID again = id(pos.sell(s, json, key).andExpect(status().isCreated()), "$.id");
        assertThat(again).isEqualTo(first);

        // Reintentos simultáneos con la misma clave
        String concurrentKey = key();
        List<Integer> statuses = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        ExecutorService pool = Executors.newFixedThreadPool(5);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<String[]>> results = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            results.add(pool.submit(() -> {
                start.await();
                var response = pos.sell(s, json, concurrentKey).andReturn().getResponse();
                return new String[]{String.valueOf(response.getStatus()), response.getContentAsString()};
            }));
        }
        start.countDown();
        for (Future<String[]> f : results) {
            String[] r = f.get(60, TimeUnit.SECONDS);
            statuses.add(Integer.parseInt(r[0]));
            ids.add(JsonPath.read(r[1], "$.id"));
        }
        pool.shutdown();
        assertThat(statuses).containsOnly(201);
        assertThat(ids).containsOnly(ids.getFirst());

        api.getWith(s, "/api/v1/sales").andExpect(jsonPath("$.totalElements").value(2));
        assertThat(pos.stock(s, product)).isEqualByComparingTo("8");
        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(number(report, "$.cash.sales")).isEqualByComparingTo("2000");
    }

    @Test
    void twentyConcurrentSalesOfTheLastUnitOnlyOneSucceeds() throws Exception {
        Owned owner = api.newTenant("ultimo");
        Session s = owner.tenant();
        UUID product = pos.productWithStock(s, "ULTIMO", "1000", "1", "500");
        UUID other = pos.productWithStock(s, "OTRO", "1000", "10", "500");
        pos.openCash(s, CAJA_1, "0");

        int attempts = 20;
        ExecutorService pool = Executors.newFixedThreadPool(attempts);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < attempts; i++) {
            results.add(pool.submit(() -> {
                start.await();
                return pos.sellCash(s, product, "1", "1000").andReturn().getResponse().getStatus();
            }));
        }
        start.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> f : results) {
            statuses.add(f.get(120, TimeUnit.SECONDS));
        }
        pool.shutdown();

        assertThat(statuses).filteredOn(code -> code == 201).hasSize(1);
        assertThat(statuses).filteredOn(code -> code == 422).hasSize(attempts - 1);
        assertThat(pos.stock(s, product)).isEqualByComparingTo("0");
        api.getWith(s, "/api/v1/inventory/consistency").andExpect(jsonPath("$.consistent").value(true));
        // Los intentos fallidos no gastaron consecutivos
        pos.sellCash(s, other, "1", "1000").andExpect(status().isCreated()).andExpect(jsonPath("$.number").value(2));
    }

    @Test
    void voidReturnsStockAndCash() throws Exception {
        Owned owner = api.newTenant("anula");
        Session s = owner.tenant();
        UUID product = pos.productWithStock(s, "P1", "3000", "10", "1000");
        UUID session = pos.openCash(s, CAJA_1, "10000");
        UUID sale = id(pos.sellCash(s, product, "2", "6000").andExpect(status().isCreated()), "$.id");
        assertThat(pos.stock(s, product)).isEqualByComparingTo("8");

        api.postWith(s, "/api/v1/sales/" + sale + "/void", "{\"reason\":\"\"}").andExpect(status().isBadRequest());
        Joined seller = api.joinAs(s, owner.tenantId(), "SELLER");
        api.postWith(seller.session(), "/api/v1/sales/" + sale + "/void", "{\"reason\":\"x\"}")
                .andExpect(status().isForbidden());

        String voided = body(api.postWith(s, "/api/v1/sales/" + sale + "/void", "{\"reason\":\"Cliente desistió\"}")
                .andExpect(status().isOk()));
        assertThat((String) JsonPath.read(voided, "$.status")).isEqualTo("VOIDED");
        assertThat((String) JsonPath.read(voided, "$.voidReason")).isEqualTo("Cliente desistió");
        assertThat(pos.stock(s, product)).isEqualByComparingTo("10");
        api.postWith(s, "/api/v1/sales/" + sale + "/void", "{\"reason\":\"otra vez\"}").andExpect(status().isConflict());

        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(((Number) JsonPath.read(report, "$.voidedCount")).intValue()).isEqualTo(1);
        assertThat(number(report, "$.cash.voidRefunds")).isEqualByComparingTo("-6000");
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("10000");
        assertThat(number(report, "$.netSales")).isEqualByComparingTo("0");

        // Venta de una sesión ya cerrada: el efectivo se devuelve desde la caja abierta actual
        UUID late = id(pos.sellCash(s, product, "1", "3000").andExpect(status().isCreated()), "$.id");
        pos.close(s, session, "13000").andExpect(status().isOk());
        api.postWith(s, "/api/v1/sales/" + late + "/void", "{\"reason\":\"Error\"}").andExpect(status().is(422));
        UUID newSession = pos.openCash(s, CAJA_1, "5000");
        api.postWith(s, "/api/v1/sales/" + late + "/void", "{\"reason\":\"Error\"}").andExpect(status().isOk());
        String newReport = body(api.getWith(s, "/api/v1/cash/sessions/" + newSession + "/report"));
        assertThat(((Number) JsonPath.read(newReport, "$.voidsHereCount")).intValue()).isEqualTo(1);
        assertThat(number(newReport, "$.cash.expected")).isEqualByComparingTo("2000");
        // El informe de la caja ya cerrada queda como se cerró (QA DIN-3): la venta anulada después sigue en sus
        // ventas netas y en efectivo, y se informa aparte.
        String closedReport = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(((Number) JsonPath.read(closedReport, "$.voidedCount")).intValue()).isEqualTo(1);
        assertThat(number(closedReport, "$.netSales")).isEqualByComparingTo("3000");
        assertThat(((Number) JsonPath.read(closedReport, "$.voidedAfterCloseCount")).intValue()).isEqualTo(1);
        assertThat(number(closedReport, "$.voidedAfterCloseTotal")).isEqualByComparingTo("3000");
        assertThat(number(closedReport, "$.byMethod[0].amount")).isEqualByComparingTo("3000");
        api.getWith(s, "/api/v1/inventory/consistency").andExpect(jsonPath("$.consistent").value(true));
    }

    @Test
    void salesAndCashRecordsAreImmutableInTheDatabase() throws Exception {
        Owned owner = api.newTenant("inmut");
        Session s = owner.tenant();
        UUID product = pos.productWithStock(s, "P1", "1000", "5", "500");
        pos.openCash(s, CAJA_1, "0");
        pos.sellCash(s, product, "1", "1000").andExpect(status().isCreated());
        String schema = "t_" + owner.slug();
        assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".sales SET total = 1"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM " + schema + ".sales"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".sale_items SET quantity = 9"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM " + schema + ".sale_payments"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".cash_movements SET amount = 1"))
                .isInstanceOf(DataAccessException.class);
        // TRUNCATE tampoco (QA SEG-12: no dispara los triggers de fila)
        assertThatThrownBy(() -> jdbc.execute("TRUNCATE " + schema + ".sales CASCADE"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.execute("TRUNCATE " + schema + ".audit_log"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.execute("TRUNCATE platform.security_events"))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void everyEndpointRejectsUsersWithoutPermission() throws Exception {
        Owned owner = api.newTenant("permv");
        Session s = owner.tenant();
        UUID product = pos.productWithStock(s, "P1", "1000", "5", "500");
        UUID session = pos.openCash(s, CAJA_1, "0");
        UUID sale = id(pos.sellCash(s, product, "1", "1000").andExpect(status().isCreated()), "$.id");

        // Bodeguero: sin permisos de ventas ni de caja
        Session warehouse = api.joinAs(s, owner.tenantId(), "WAREHOUSE").session();
        api.postWithHeaders(warehouse, "/api/v1/sales", "{\"items\":[{\"productId\":\"" + product + "\",\"quantity\":1}]}",
                "Idempotency-Key", key()).andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/sales").andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/sales/" + sale).andExpect(status().isForbidden());
        api.postWith(warehouse, "/api/v1/sales/" + sale + "/void", "{\"reason\":\"x\"}").andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/sales/config").andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/sales/price?productId=" + product).andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/payment-methods").andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/cash/registers").andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/cash/sessions/current").andExpect(status().isForbidden());
        pos.openCashRaw(warehouse, CAJA_1, "0").andExpect(status().isForbidden());
        api.postWith(warehouse, "/api/v1/cash/sessions/" + session + "/movements",
                "{\"type\":\"INCOME\",\"amount\":1,\"reason\":\"x\"}").andExpect(status().isForbidden());
        pos.close(warehouse, session, "0").andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/cash/sessions").andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/cash/sessions/" + session).andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/cash/sessions/" + session + "/movements").andExpect(status().isForbidden());
        api.getWith(warehouse, "/api/v1/cash/sessions/" + session + "/report").andExpect(status().isForbidden());

        // Vendedor: abre su propia caja y vende (V10); no ve el historial de cajas ni anula
        Session seller = api.joinAs(s, owner.tenantId(), "SELLER").session();
        api.getWith(seller, "/api/v1/sales").andExpect(status().isOk());
        api.getWith(seller, "/api/v1/sales/config").andExpect(status().isOk());
        pos.sellCash(seller, product, "1", "1000").andExpect(status().is(422)); // sin caja abierta
        UUID caja2 = pos.newRegister(s, api.principalBranchId(s), "CAJA2");
        pos.openCashRaw(seller, caja2, "0").andExpect(status().isCreated());
        pos.sellCash(seller, product, "1", "1000").andExpect(status().isCreated());
        api.getWith(seller, "/api/v1/cash/sessions").andExpect(status().isForbidden());
        api.postWith(seller, "/api/v1/sales/" + sale + "/void", "{\"reason\":\"x\"}").andExpect(status().isForbidden());

        // Contador: consulta ventas y caja, no vende
        Session accountant = api.joinAs(s, owner.tenantId(), "ACCOUNTANT").session();
        api.getWith(accountant, "/api/v1/sales/" + sale).andExpect(status().isOk());
        api.getWith(accountant, "/api/v1/cash/sessions").andExpect(status().isOk());
        api.getWith(accountant, "/api/v1/cash/sessions/" + session + "/report").andExpect(status().isOk())
                .andExpect(jsonPath("$.auditView").value(true));
        pos.sellCash(accountant, product, "1", "1000").andExpect(status().isForbidden());
    }

    @Test
    void tenantsAreIsolatedAndPlatformTokensAreRejected() throws Exception {
        Owned a = api.newTenant("venta-a");
        Owned b = api.newTenant("venta-b");
        UUID productA = pos.productWithStock(a.tenant(), "P1", "1000", "5", "500");
        UUID sessionA = pos.openCash(a.tenant(), CAJA_1, "0");
        UUID saleA = id(pos.sellCash(a.tenant(), productA, "1", "1000").andExpect(status().isCreated()), "$.id");

        Session sb = b.tenant();
        api.getWith(sb, "/api/v1/sales/" + saleA).andExpect(status().isNotFound());
        api.postWith(sb, "/api/v1/sales/" + saleA + "/void", "{\"reason\":\"x\"}").andExpect(status().isNotFound());
        api.getWith(sb, "/api/v1/sales").andExpect(jsonPath("$.totalElements").value(0));
        api.getWith(sb, "/api/v1/cash/sessions/" + sessionA).andExpect(status().isNotFound());
        api.getWith(sb, "/api/v1/cash/sessions/" + sessionA + "/report").andExpect(status().isNotFound());
        pos.close(sb, sessionA, "0").andExpect(status().isNotFound());
        pos.openCash(sb, CAJA_1, "0");
        pos.sellCash(sb, productA, "1", "1000").andExpect(status().isNotFound());
        assertThat(pos.stock(a.tenant(), productA)).isEqualByComparingTo("4");

        // Token sin negocio (tid) → 403
        api.getWith(a.platform(), "/api/v1/sales").andExpect(status().isForbidden());
        api.getWith(a.platform(), "/api/v1/cash/sessions/current").andExpect(status().isForbidden());
        pos.sellCash(a.platform(), productA, "1", "1000").andExpect(status().isForbidden());
    }

    private UUID boxedProduct(Session s, String sku, int perBox, String price) throws Exception {
        return id(api.postWith(s, "/api/v1/products", """
                {"sku":"%s","name":"Producto %s","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":%s,
                 "trackInventory":true,"conversions":[{"unitId":"%s","factor":%d}]}
                """.formatted(sku, sku, UND, IVA19, price, CJ, perBox)).andExpect(status().isCreated()), "$.id");
    }
}
