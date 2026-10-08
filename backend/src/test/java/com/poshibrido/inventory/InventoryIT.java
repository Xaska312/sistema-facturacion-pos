package com.poshibrido.inventory;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.catalog.CatalogFixturesAccess;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Inventario: criterio de aceptación de la Fase 4 — el saldo siempre coincide con la suma de movimientos —
 * más concurrencia, idempotencia, inmutabilidad, costo promedio, permisos y aislamiento.
 */
class InventoryIT extends IntegrationTest {

    private static final UUID UND = UUID.fromString("01920000-0000-7000-8000-000000000301");
    private static final UUID KG = UUID.fromString("01920000-0000-7000-8000-000000000302");
    private static final UUID CJ = UUID.fromString("01920000-0000-7000-8000-000000000308");
    private static final UUID IVA19 = UUID.fromString("01920000-0000-7000-8000-000000000401");

    @Test
    void everyOperationKeepsBalanceEqualToSumOfMovements() throws Exception {
        Owned owner = api.newTenant("inv");
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID north = createBranch(s, "NORTE");
        UUID product = createProductWithBox(s, "GAS-1", 12);

        // Saldo inicial: 24 UND a 1.000
        post(s, "/api/v1/inventory/initial-balances", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":24,"unitCost":1000}]}
                """.formatted(principal, product)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("INITIAL"));
        // Entrada de 1 caja (12 UND) a 24.000 la caja = 2.000 por UND → promedio 1.333,33
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"Compra sin factura","lines":[{"productId":"%s","unitId":"%s","quantity":1,
                 "direction":"IN","unitCost":24000}]}
                """.formatted(principal, product, CJ)).andExpect(status().isCreated());
        // Salida por daño: 5
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"Daño","lines":[{"productId":"%s","quantity":5,"direction":"OUT"}]}
                """.formatted(principal, product)).andExpect(status().isCreated());
        // Traslado de 10 a la sede norte
        post(s, "/api/v1/inventory/transfers", """
                {"fromBranchId":"%s","toBranchId":"%s","lines":[{"productId":"%s","quantity":10}]}
                """.formatted(principal, north, product)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.targetBranchName").value("Sede NORTE"));
        // Conteo físico: el sistema espera 21 (24 + 12 - 5 - 10), se cuentan 20 → falta 1
        String count = body(post(s, "/api/v1/inventory/counts", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":20}]}
                """.formatted(principal, product)).andExpect(status().isCreated()));
        assertNumber(count, "$.lines[0].expectedQuantity", "21");
        assertNumber(count, "$.lines[0].difference", "-1");
        assertThat((String) JsonPath.read(count, "$.lines[0].direction")).isEqualTo("OUT");

        assertNumber(body(balance(s, principal, product)), "$.quantity", "20");
        assertNumber(body(balance(s, north, product)), "$.quantity", "10");
        String row = body(balance(s, principal, product));
        assertNumber(row, "$.averageCost", "1333.33");

        // Kardex de la sede principal: 5 movimientos, el último con saldo 20
        String kardex = body(api.getWith(s, "/api/v1/inventory/kardex?productId=" + product + "&branchId=" + principal)
                .andExpect(status().isOk()));
        List<String> types = JsonPath.read(kardex, "$.content[*].type");
        assertThat(types).containsExactly("ADJUSTMENT_OUT", "TRANSFER_OUT", "ADJUSTMENT_OUT", "ADJUSTMENT_IN", "INITIAL");
        assertNumber(kardex, "$.content[0].balanceAfter", "20");

        assertLedgerConsistent(owner);
        api.getWith(s, "/api/v1/inventory/consistency").andExpect(jsonPath("$.consistent").value(true));

        // El costo ya lo maneja el inventario: no se edita a mano
        assertThat((Boolean) JsonPath.read(body(api.getWith(s, "/api/v1/products/" + product)), "$.costLocked")).isTrue();
        String edit = """
                {"sku":"GAS-1","name":"Producto GAS-1","baseUnitId":"%s","taxId":"%s","cost":%s,"salePrice":2100,
                 "trackInventory":true,"conversions":[{"unitId":"%s","factor":12}]}
                """;
        api.putWith(s, "/api/v1/products/" + product, edit.formatted(UND, IVA19, "999", CJ)).andExpect(status().is(422));
        api.putWith(s, "/api/v1/products/" + product, edit.formatted(UND, IVA19, "1333.33", CJ)).andExpect(status().isOk());
        // Con movimientos, la unidad base no cambia (los saldos están en esa unidad)
        api.putWith(s, "/api/v1/products/" + product, edit.formatted(KG, IVA19, "1333.33", CJ)).andExpect(status().is(422));
        // La importación CSV tampoco cambia el costo promedio
        String csv = """
                sku,nombre,unidad,impuesto,precio,costo
                GAS-1,Producto GAS-1,UND,IVA19,2100,500
                """;
        api.upload(s, "/api/v1/products/import", csv.getBytes(StandardCharsets.UTF_8), "dryRun", "false")
                .andExpect(jsonPath("$.applied").value(true));
        assertNumber(body(api.getWith(s, "/api/v1/products/" + product)), "$.cost", "1333.33");
    }

    @Test
    void insufficientStockIsRejectedAndNothingChanges() throws Exception {
        Owned owner = api.newTenant("inv2");
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID north = createBranch(s, "NORTE");
        UUID product = createProduct(s, "P-1");
        initial(s, principal, product, "3", "500");

        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"Robo","lines":[{"productId":"%s","quantity":4,"direction":"OUT"}]}
                """.formatted(principal, product)).andExpect(status().is(422));
        post(s, "/api/v1/inventory/transfers", """
                {"fromBranchId":"%s","toBranchId":"%s","lines":[{"productId":"%s","quantity":4}]}
                """.formatted(principal, north, product)).andExpect(status().is(422));
        assertNumber(body(balance(s, principal, product)), "$.quantity", "3");
        api.getWith(s, "/api/v1/inventory/documents").andExpect(jsonPath("$.totalElements").value(1));
        assertLedgerConsistent(owner);
    }

    @Test
    void validationRules() throws Exception {
        Owned owner = api.newTenant("inv3");
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID product = createProduct(s, "P-1");
        initial(s, principal, product, "3", "500");

        // Segundo saldo inicial del mismo producto y sucursal
        post(s, "/api/v1/inventory/initial-balances", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":1,"unitCost":1}]}
                """.formatted(principal, product)).andExpect(status().isConflict());
        // UND no admite decimales
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"x","lines":[{"productId":"%s","quantity":1.5,"direction":"IN"}]}
                """.formatted(principal, product)).andExpect(status().is(422));
        // Sin motivo
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"","lines":[{"productId":"%s","quantity":1,"direction":"IN"}]}
                """.formatted(principal, product)).andExpect(status().isBadRequest());
        // Sin dirección
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"x","lines":[{"productId":"%s","quantity":1}]}
                """.formatted(principal, product)).andExpect(status().is(422));
        // Producto repetido
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"x","lines":[{"productId":"%s","quantity":1,"direction":"IN"},
                 {"productId":"%s","quantity":1,"direction":"IN"}]}
                """.formatted(principal, product, product)).andExpect(status().is(422));
        // Unidad que no es del producto
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"x","lines":[{"productId":"%s","unitId":"%s","quantity":1,"direction":"IN"}]}
                """.formatted(principal, product, CJ)).andExpect(status().is(422));
        // Traslado a la misma sucursal
        post(s, "/api/v1/inventory/transfers", """
                {"fromBranchId":"%s","toBranchId":"%s","lines":[{"productId":"%s","quantity":1}]}
                """.formatted(principal, principal, product)).andExpect(status().is(422));

        // Producto que no controla inventario
        UUID service = UUID.fromString(JsonPath.read(body(api.postWith(s, "/api/v1/products", """
                {"sku":"SERV-1","name":"Servicio","baseUnitId":"%s","taxId":"%s","salePrice":1000,"trackInventory":false}
                """.formatted(UND, IVA19)).andExpect(status().isCreated())), "$.id"));
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"x","lines":[{"productId":"%s","quantity":1,"direction":"IN"}]}
                """.formatted(principal, service)).andExpect(status().is(422));

        // Producto por peso: admite decimales
        UUID rice = UUID.fromString(JsonPath.read(body(api.postWith(s, "/api/v1/products", """
                {"sku":"ARROZ-KG","name":"Arroz a granel","baseUnitId":"%s","taxId":"%s","salePrice":4000,"trackInventory":true}
                """.formatted(KG, IVA19)).andExpect(status().isCreated())), "$.id"));
        initial(s, principal, rice, "12.5", "3000");
        assertNumber(body(balance(s, principal, rice)), "$.quantity", "12.5");
        assertLedgerConsistent(owner);
    }

    @Test
    void sameIdempotencyKeyCreatesOneDocument() throws Exception {
        Owned owner = api.newTenant("inv4");
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID product = createProduct(s, "P-1");
        String json = """
                {"branchId":"%s","reason":"Donación","lines":[{"productId":"%s","quantity":2,"direction":"IN"}]}
                """.formatted(principal, product);
        String first = body(api.postWithHeaders(s, "/api/v1/inventory/adjustments", json, "Idempotency-Key", "ajuste-0001")
                .andExpect(status().isCreated()));
        String second = body(api.postWithHeaders(s, "/api/v1/inventory/adjustments", json, "Idempotency-Key", "ajuste-0001")
                .andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(second, "$.id")).isEqualTo(JsonPath.read(first, "$.id"));
        assertNumber(body(balance(s, principal, product)), "$.quantity", "2");

        api.postWithHeaders(s, "/api/v1/inventory/adjustments", json, "Idempotency-Key", "ajuste-0002")
                .andExpect(status().isCreated());
        assertNumber(body(balance(s, principal, product)), "$.quantity", "4");
        api.postWithHeaders(s, "/api/v1/inventory/adjustments", json, "Idempotency-Key", "mal")
                .andExpect(status().is(422));

        // QA INV-10: la clave usada en otra operación u otro usuario no devuelve el documento ajeno.
        String count = """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":4}]}
                """.formatted(principal, product);
        api.postWithHeaders(s, "/api/v1/inventory/counts", count, "Idempotency-Key", "ajuste-0001")
                .andExpect(status().isConflict());
        Joined warehouse = api.joinAs(s, owner.tenantId(), "WAREHOUSE");
        api.postWithHeaders(warehouse.session(), "/api/v1/inventory/adjustments", json, "Idempotency-Key", "ajuste-0001")
                .andExpect(status().isConflict());
        assertNumber(body(balance(s, principal, product)), "$.quantity", "4");
    }

    @Test
    void concurrentOutputsNeverOversell() throws Exception {
        Owned owner = api.newTenant("inv5");
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID product = createProduct(s, "ULTIMO");
        initial(s, principal, product, "5", "100");
        String json = """
                {"branchId":"%s","reason":"Salida","lines":[{"productId":"%s","quantity":1,"direction":"OUT"}]}
                """.formatted(principal, product);

        int attempts = 12;
        ExecutorService pool = Executors.newFixedThreadPool(attempts);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < attempts; i++) {
            results.add(pool.submit(() -> {
                start.await();
                return post(s, "/api/v1/inventory/adjustments", json).andReturn().getResponse().getStatus();
            }));
        }
        start.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> f : results) {
            statuses.add(f.get(60, TimeUnit.SECONDS));
        }
        pool.shutdown();

        assertThat(statuses).filteredOn(code -> code == 201).hasSize(5);
        assertThat(statuses).filteredOn(code -> code == 422).hasSize(attempts - 5);
        assertNumber(body(balance(s, principal, product)), "$.quantity", "0");
        assertLedgerConsistent(owner);
    }

    @Test
    void concurrentEntriesWithCostAndOutputsSerializeWithoutConflicts() throws Exception {
        Owned owner = api.newTenant("inv9");
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID north = createBranch(s, "NORTE");
        UUID product = createProduct(s, "MIXTO");
        initial(s, principal, product, "100", "100");
        String in = """
                {"branchId":"%s","reason":"Compra","lines":[{"productId":"%s","quantity":1,"direction":"IN","unitCost":200}]}
                """.formatted(principal, product);
        String out = """
                {"branchId":"%s","reason":"Salida","lines":[{"productId":"%s","quantity":1,"direction":"OUT"}]}
                """.formatted(principal, product);
        // Producto sin movimientos: su primer movimiento marca el costo como manejado por el inventario
        UUID fresh = createProduct(s, "NUEVO");
        String freshIn = """
                {"branchId":"%s","reason":"Hallazgo","lines":[{"productId":"%s","quantity":1,"direction":"IN"}]}
                """;

        List<String> bodies = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            bodies.add(in);
            bodies.add(out);
        }
        List<Integer> statuses = concurrently(s, "/api/v1/inventory/adjustments", bodies);
        assertThat(statuses).containsOnly(201);
        assertNumber(body(balance(s, principal, product)), "$.quantity", "100");

        List<String> freshBodies = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            freshBodies.add(freshIn.formatted(i % 2 == 0 ? principal : north, fresh));
        }
        assertThat(concurrently(s, "/api/v1/inventory/adjustments", freshBodies)).containsOnly(201);
        assertNumber(body(balance(s, principal, fresh)), "$.quantity", "3");
        assertNumber(body(balance(s, north, fresh)), "$.quantity", "3");
        assertLedgerConsistent(owner);
    }

    @Test
    void movementsAndDocumentsAreImmutableInTheDatabase() throws Exception {
        Owned owner = api.newTenant("inv6");
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID product = createProduct(s, "P-1");
        initial(s, principal, product, "3", "500");
        String schema = "t_" + owner.slug();

        assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".stock_movements SET quantity = 100"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM " + schema + ".stock_movements"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM " + schema + ".inventory_documents"))
                .isInstanceOf(DataAccessException.class);
        assertLedgerConsistent(owner);
    }

    @Test
    void minimumStockAlerts() throws Exception {
        Owned owner = api.newTenant("inv7");
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID product = createProduct(s, "P-1");
        initial(s, principal, product, "3", "500");

        api.putWith(s, "/api/v1/inventory/stock-levels", """
                {"branchId":"%s","productId":"%s","minStock":10,"maxStock":5}
                """.formatted(principal, product)).andExpect(status().is(422));
        api.putWith(s, "/api/v1/inventory/stock-levels", """
                {"branchId":"%s","productId":"%s","minStock":5,"maxStock":50}
                """.formatted(principal, product)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("LOW"));
        api.getWith(s, "/api/v1/inventory/alerts").andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].sku").value("P-1"));
        api.getWith(s, "/api/v1/inventory/stock?branchId=" + principal + "&search=P-1")
                .andExpect(jsonPath("$.content[0].status").value("LOW"));

        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"Reposición","lines":[{"productId":"%s","quantity":10,"direction":"IN"}]}
                """.formatted(principal, product)).andExpect(status().isCreated());
        api.getWith(s, "/api/v1/inventory/alerts").andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void permissionsByRole() throws Exception {
        Owned owner = api.newTenant("inv8");
        Session s = owner.tenant();
        UUID principal = api.principalBranchId(s);
        UUID north = createBranch(s, "NORTE");
        UUID product = createProduct(s, "P-1");
        initial(s, principal, product, "10", "500");
        String adjust = """
                {"branchId":"%s","reason":"x","lines":[{"productId":"%s","quantity":1,"direction":"OUT"}]}
                """.formatted(principal, product);
        String transfer = """
                {"fromBranchId":"%s","toBranchId":"%s","lines":[{"productId":"%s","quantity":1}]}
                """.formatted(principal, north, product);

        Joined seller = api.joinAs(s, owner.tenantId(), "SELLER");
        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        Joined warehouse = api.joinAs(s, owner.tenantId(), "WAREHOUSE");

        balance(seller.session(), principal, product).andExpect(status().isOk());
        post(seller.session(), "/api/v1/inventory/adjustments", adjust).andExpect(status().isForbidden());
        post(cashier.session(), "/api/v1/inventory/transfers", transfer).andExpect(status().isForbidden());
        post(warehouse.session(), "/api/v1/inventory/adjustments", adjust).andExpect(status().isCreated());
        post(warehouse.session(), "/api/v1/inventory/transfers", transfer).andExpect(status().isCreated());
        // QA INV-11: la verificación de consistencia recorre todo el kardex; no basta con poder ver el inventario.
        api.getWith(seller.session(), "/api/v1/inventory/consistency").andExpect(status().isForbidden());
        api.getWith(warehouse.session(), "/api/v1/inventory/consistency").andExpect(status().isOk());

        // El responsable queda registrado en el kardex
        String kardex = body(api.getWith(s, "/api/v1/inventory/kardex?productId=" + product + "&branchId=" + principal));
        assertThat((String) JsonPath.read(kardex, "$.content[0].createdByName")).isEqualTo("Usuario de prueba");
    }

    @Test
    void tenantsAreIsolated() throws Exception {
        Owned a = api.newTenant("inva");
        Owned b = api.newTenant("invb");
        UUID principalA = api.principalBranchId(a.tenant());
        UUID productA = createProduct(a.tenant(), "SOLO-A");
        String doc = body(initial(a.tenant(), principalA, productA, "7", "100"));
        UUID docA = UUID.fromString(JsonPath.read(doc, "$.id"));

        api.getWith(b.tenant(), "/api/v1/inventory/documents/" + docA).andExpect(status().isNotFound());
        api.getWith(b.tenant(), "/api/v1/inventory/documents").andExpect(jsonPath("$.totalElements").value(0));
        api.getWith(b.tenant(), "/api/v1/inventory/kardex?productId=" + productA).andExpect(status().isNotFound());
        post(b.tenant(), "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"x","lines":[{"productId":"%s","quantity":1,"direction":"OUT"}]}
                """.formatted(api.principalBranchId(b.tenant()), productA)).andExpect(status().isNotFound());
        assertNumber(body(balance(a.tenant(), principalA, productA)), "$.quantity", "7");
    }

    // ------------------------------------------------------------------ apoyo

    /** Verificación directa en SQL: saldo = suma de movimientos = balance_after del último. */
    private List<Integer> concurrently(Session s, String path, List<String> bodies) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(bodies.size());
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();
        for (String json : bodies) {
            results.add(pool.submit(() -> {
                start.await();
                return post(s, path, json).andReturn().getResponse().getStatus();
            }));
        }
        start.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> f : results) {
            statuses.add(f.get(60, TimeUnit.SECONDS));
        }
        pool.shutdown();
        return statuses;
    }

    private void assertLedgerConsistent(Owned owner) {
        String s = "t_" + owner.slug();
        Integer mismatches = jdbc.queryForObject("""
                SELECT count(*) FROM %1$s.stock_balances b
                WHERE b.quantity <> COALESCE((SELECT sum(m.quantity) FROM %1$s.stock_movements m
                                              WHERE m.branch_id = b.branch_id AND m.product_id = b.product_id), 0)
                   OR b.quantity <> COALESCE((SELECT m.balance_after FROM %1$s.stock_movements m
                                              WHERE m.branch_id = b.branch_id AND m.product_id = b.product_id
                                              ORDER BY m.entry_no DESC LIMIT 1), 0)
                """.formatted(s), Integer.class);
        assertThat(mismatches).as("saldos distintos a la suma de movimientos").isZero();
        Integer negatives = jdbc.queryForObject("SELECT count(*) FROM " + s + ".stock_balances WHERE quantity < 0",
                Integer.class);
        assertThat(negatives).isZero();
    }

    @Test
    void countAdjustsAgainstWhatTheSystemShowedWhenCountingStarted() throws Exception {
        // QA INV-2: se empieza a contar con 50 en el sistema, mientras se cuenta se venden 5 (queda 45) y se
        // registra lo contado (50). Antes el ajuste era 50 − 45 = +5 y "aparecían" 5 unidades; ahora es 50 − 50 = 0.
        Owned owner = api.newTenant("conteo-vivo");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        UUID product = createProductWithBox(s, "CONT-1", 12);
        initial(s, branch, product, "50", "1000").andExpect(status().isCreated());
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"Venta durante el conteo","lines":[{"productId":"%s","quantity":5,
                 "direction":"OUT"}]}
                """.formatted(branch, product)).andExpect(status().isCreated());

        String count = body(post(s, "/api/v1/inventory/counts", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":50,"expectedQuantity":50}]}
                """.formatted(branch, product)).andExpect(status().isCreated()));
        assertNumber(count, "$.lines[0].difference", "0");
        assertNumber(body(balance(s, branch, product)), "$.quantity", "45");

        // Contó 48 de los 50 que había al empezar: faltan 2 → 45 − 2 = 43
        post(s, "/api/v1/inventory/counts", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":48,"expectedQuantity":50}]}
                """.formatted(branch, product)).andExpect(status().isCreated());
        assertNumber(body(balance(s, branch, product)), "$.quantity", "43");
        assertLedgerConsistent(owner);
    }

    @Test
    void outOfRangeQuantitiesAreRejectedWith422() throws Exception {
        // QA INV-8: 9.999.999.999 cajas de 12 no caben en la columna: antes daba 500.
        Owned owner = api.newTenant("rango");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        UUID product = createProductWithBox(s, "RANGO-1", 12);
        post(s, "/api/v1/inventory/initial-balances", """
                {"branchId":"%s","lines":[{"productId":"%s","unitId":"%s","quantity":9999999999,"unitCost":1}]}
                """.formatted(branch, product, CJ)).andExpect(status().is(422));
    }

    @Test
    void inventoryControlCannotBeTurnedOffWithStock() throws Exception {
        // QA INV-3: con existencias, dejar de controlar el inventario congelaba el saldo.
        Owned owner = api.newTenant("sin-control");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        UUID product = createProductWithBox(s, "CTRL-1", 12);
        initial(s, branch, product, "3", "1000").andExpect(status().isCreated());
        String edit = """
                {"sku":"CTRL-1","name":"Producto CTRL-1","baseUnitId":"%s","taxId":"%s","salePrice":2000,
                 "trackInventory":false,"conversions":[{"unitId":"%s","factor":12}]}
                """.formatted(UND, IVA19, CJ);
        api.putWith(s, "/api/v1/products/" + product, edit).andExpect(status().is(422));
        post(s, "/api/v1/inventory/adjustments", """
                {"branchId":"%s","reason":"Se agotó","lines":[{"productId":"%s","quantity":3,"direction":"OUT"}]}
                """.formatted(branch, product)).andExpect(status().isCreated());
        api.putWith(s, "/api/v1/products/" + product, edit).andExpect(status().isOk());
    }

    private ResultActions post(Session s, String path, String json) throws Exception {
        return api.postWith(s, path, json);
    }

    private ResultActions balance(Session s, UUID branchId, UUID productId) throws Exception {
        return api.getWith(s, "/api/v1/inventory/balance?branchId=" + branchId + "&productId=" + productId)
                .andExpect(status().isOk());
    }

    private ResultActions initial(Session s, UUID branchId, UUID productId, String quantity, String cost)
            throws Exception {
        return post(s, "/api/v1/inventory/initial-balances", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":%s,"unitCost":%s}]}
                """.formatted(branchId, productId, quantity, cost)).andExpect(status().isCreated());
    }

    private UUID createBranch(Session s, String code) throws Exception {
        return UUID.fromString(JsonPath.read(body(api.postWith(s, "/api/v1/branches", """
                {"code":"%s","name":"Sede %s"}
                """.formatted(code, code)).andExpect(status().isCreated())), "$.id"));
    }

    private UUID createProduct(Session s, String sku) throws Exception {
        return UUID.fromString(JsonPath.read(body(api.postWith(s, "/api/v1/products",
                CatalogFixturesAccess.simpleProduct(sku, "Producto " + sku, "2000")).andExpect(status().isCreated())), "$.id"));
    }

    private UUID createProductWithBox(Session s, String sku, int perBox) throws Exception {
        return UUID.fromString(JsonPath.read(body(api.postWith(s, "/api/v1/products", """
                {"sku":"%s","name":"Producto %s","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":2000,
                 "trackInventory":true,"conversions":[{"unitId":"%s","factor":%d}]}
                """.formatted(sku, sku, UND, IVA19, CJ, perBox)).andExpect(status().isCreated())), "$.id"));
    }

    private static String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }

    private static void assertNumber(String json, String path, String expected) {
        Object value = JsonPath.read(json, path);
        assertThat(new BigDecimal(String.valueOf(value))).as(path).isEqualByComparingTo(expected);
    }
}
