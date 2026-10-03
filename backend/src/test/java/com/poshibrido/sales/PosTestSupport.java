package com.poshibrido.sales;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.catalog.CatalogFixturesAccess;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Session;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.util.UUID;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Ayudas para tests de caja y ventas: productos con existencia, cajas y ventas. */
public final class PosTestSupport {

    public static final UUID CAJA_1 = UUID.fromString("01920000-0000-7000-8000-000000000201");
    public static final UUID CASH = UUID.fromString("01920000-0000-7000-8000-000000000701");
    public static final UUID CARD = UUID.fromString("01920000-0000-7000-8000-000000000702");
    public static final UUID TRANSFER = UUID.fromString("01920000-0000-7000-8000-000000000703");
    public static final UUID UND = UUID.fromString("01920000-0000-7000-8000-000000000301");
    public static final UUID CJ = UUID.fromString("01920000-0000-7000-8000-000000000308");
    public static final UUID IVA19 = UUID.fromString("01920000-0000-7000-8000-000000000401");

    private final TestApi api;

    public PosTestSupport(TestApi api) {
        this.api = api;
    }

    public static String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }

    public static UUID id(ResultActions result, String path) throws Exception {
        return UUID.fromString(JsonPath.read(body(result), path));
    }

    public static BigDecimal number(String json, String path) {
        Object value = JsonPath.read(json, path);
        return new BigDecimal(String.valueOf(value));
    }

    /**
     * Ruta JsonPath de una propiedad extra de un ProblemDetail: en la raíz o, según la configuración de Jackson,
     * bajo {@code properties}.
     */
    public static String problemPath(String json, String path) {
        try {
            JsonPath.read(json, "$." + path);
            return "$." + path;
        } catch (com.jayway.jsonpath.PathNotFoundException ex) {
            return "$.properties." + path;
        }
    }

    public static String key() {
        return "test-" + UUID.randomUUID();
    }

    /** Producto con IVA 19 % incluido en el precio y la existencia indicada en la sede principal. */
    public UUID productWithStock(Session s, String sku, String price, String quantity, String cost) throws Exception {
        UUID product = id(api.postWith(s, "/api/v1/products", CatalogFixturesAccess.simpleProduct(sku, "Producto " + sku,
                price)).andExpect(status().isCreated()), "$.id");
        if (quantity != null) {
            api.postWith(s, "/api/v1/inventory/initial-balances", """
                    {"branchId":"%s","lines":[{"productId":"%s","quantity":%s,"unitCost":%s}]}
                    """.formatted(api.principalBranchId(s), product, quantity, cost)).andExpect(status().isCreated());
        }
        return product;
    }

    /** Servicio (no controla inventario). */
    public UUID service(Session s, String sku, String price) throws Exception {
        return id(api.postWith(s, "/api/v1/products", """
                {"sku":"%s","name":"Servicio %s","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":%s,
                 "trackInventory":false}
                """.formatted(sku, sku, UND, IVA19, price)).andExpect(status().isCreated()), "$.id");
    }

    public UUID openCash(Session s, UUID registerId, String opening) throws Exception {
        return id(openCashRaw(s, registerId, opening).andExpect(status().isCreated()), "$.id");
    }

    public ResultActions openCashRaw(Session s, UUID registerId, String opening) throws Exception {
        return api.postWith(s, "/api/v1/cash/sessions", """
                {"cashRegisterId":"%s","openingAmount":%s}
                """.formatted(registerId, opening));
    }

    public UUID newRegister(Session s, UUID branchId, String code) throws Exception {
        return id(api.postWith(s, "/api/v1/cash-registers", """
                {"branchId":"%s","code":"%s","name":"Caja %s"}
                """.formatted(branchId, code, code)).andExpect(status().isCreated()), "$.id");
    }

    public ResultActions sell(Session s, String json, String idempotencyKey) throws Exception {
        return idempotencyKey == null
                ? api.postWith(s, "/api/v1/sales", json)
                : api.postWithHeaders(s, "/api/v1/sales", json, "Idempotency-Key", idempotencyKey);
    }

    /** Venta de un producto en unidad base pagada en efectivo. */
    public ResultActions sellCash(Session s, UUID productId, String quantity, String cash) throws Exception {
        return sell(s, """
                {"items":[{"productId":"%s","quantity":%s}],
                 "payments":[{"paymentMethodId":"%s","amount":%s}]}
                """.formatted(productId, quantity, CASH, cash), key());
    }

    public ResultActions close(Session s, UUID sessionId, String counted) throws Exception {
        return api.postWith(s, "/api/v1/cash/sessions/" + sessionId + "/close", """
                {"countedAmount":%s}
                """.formatted(counted));
    }

    public BigDecimal stock(Session s, UUID productId) throws Exception {
        String json = body(api.getWith(s, "/api/v1/inventory/balance?branchId=" + api.principalBranchId(s)
                + "&productId=" + productId).andExpect(status().isOk()));
        return number(json, "$.quantity");
    }
}
