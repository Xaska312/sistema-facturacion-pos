package com.poshibrido.catalog;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Fase 8d: escalas de tallas y modelos con variantes (talla × color). */
class ProductModelIT extends IntegrationTest {

    /** Ids sembrados en cada negocio (V5 y V13). */
    static final String IVA19 = "01920000-0000-7000-8000-000000000401";
    static final String CALZADO_CO = "01920000-0000-7000-8000-000000001101";
    static final String ROPA_LETRAS = "01920000-0000-7000-8000-000000001105";

    @Test
    void seededScalesAreAvailable() throws Exception {
        Owned owner = api.newTenant("tallas");
        String body = body(api.getWith(owner.tenant(), "/api/v1/size-scales").andExpect(status().isOk()));
        List<String> names = JsonPath.read(body, "$[*].name");
        assertThat(names).contains("Calzado Colombia", "Calzado EU", "Calzado US", "Calzado niño", "Ropa (letras)");
        List<String> colombia = JsonPath.read(body, "$[?(@.code == 'CALZADO_CO')].sizes[*].label");
        assertThat(colombia).startsWith("34", "35").endsWith("45").hasSize(12);
    }

    @Test
    void aModelCreatesOneSellableProductPerSizeAndColor() throws Exception {
        Owned owner = api.newTenant("modelo");
        Session s = owner.tenant();
        String model = body(api.postWith(s, "/api/v1/product-models", """
                {"skuPrefix":"run","name":"Tenis Runner","taxId":"%s","cost":60000,"salePrice":120000,
                 "sizeScaleId":"%s","sizes":["40","38","39"],"colors":["negro","Blanco","Negro"]}
                """.formatted(IVA19, CALZADO_CO)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.skuPrefix").value("RUN"))
                .andExpect(jsonPath("$.sizes.length()").value(3))
                .andExpect(jsonPath("$.sizes[0]").value("38"))
                .andExpect(jsonPath("$.colors[0]").value("Negro"))
                .andExpect(jsonPath("$.colors[1]").value("Blanco"))
                .andExpect(jsonPath("$.variants.length()").value(6))
                .andExpect(jsonPath("$.variants[0].sku").value("RUN-38-NEGRO"))
                .andExpect(jsonPath("$.variants[0].name").value("Tenis Runner T38 Negro"))
                .andExpect(jsonPath("$.variants[0].baseUnitCode").value("UND"))
                .andExpect(jsonPath("$.variants[0].barcode").value(startsWith("29"))));
        UUID modelId = UUID.fromString(JsonPath.read(model, "$.id"));
        String variantId = JsonPath.read(model, "$.variants[0].productId");
        String barcode = JsonPath.read(model, "$.variants[0].barcode");

        // La lista de productos no muestra las tallas; el POS (búsqueda y lector) sí.
        api.getWith(s, "/api/v1/products?search=Runner&includeVariants=false")
                .andExpect(jsonPath("$.totalElements").value(0));
        api.getWith(s, "/api/v1/products?search=Runner").andExpect(jsonPath("$.totalElements").value(6));
        api.getWith(s, "/api/v1/products/lookup?code=" + barcode)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Tenis Runner T38 Negro"));
        api.getWith(s, "/api/v1/product-models?search=runner")
                .andExpect(jsonPath("$.content[0].variants").value(6));

        // El precio es del modelo: cambia en todas las tallas; la talla no se edita sola.
        api.putWith(s, "/api/v1/product-models/" + modelId, """
                {"name":"Tenis Runner Pro","taxId":"%s","salePrice":130000}
                """.formatted(IVA19)).andExpect(status().isOk());
        String variant = body(api.getWith(s, "/api/v1/products/" + variantId).andExpect(status().isOk()));
        assertThat(new BigDecimal(JsonPath.read(variant, "$.salePrice").toString())).isEqualByComparingTo("130000");
        assertThat(new BigDecimal(JsonPath.read(variant, "$.cost").toString())).isEqualByComparingTo("60000");
        assertThat((String) JsonPath.read(variant, "$.name")).isEqualTo("Tenis Runner Pro T38 Negro");
        assertThat((String) JsonPath.read(variant, "$.variantSize")).isEqualTo("38");
        api.putWith(s, "/api/v1/products/" + variantId, CatalogFixturesAccess.simpleProduct("RUN-38-NEGRO", "x", "1"))
                .andExpect(status().is(422));

        // Agregar tallas y colores crea solo las combinaciones que faltan.
        api.postWith(s, "/api/v1/product-models/" + modelId + "/variants", """
                {"sizes":["41","38"],"colors":["Negro","Azul cielo"]}
                """).andExpect(status().isOk())
                .andExpect(jsonPath("$.variants.length()").value(9))
                .andExpect(jsonPath("$.colors[2]").value("Azul cielo"));
        String withBlue = body(api.getWith(s, "/api/v1/product-models/" + modelId));
        List<String> skus = JsonPath.read(withBlue, "$.variants[*].sku");
        assertThat(skus).contains("RUN-41-NEGRO", "RUN-38-AZULCI", "RUN-41-AZULCI").doesNotHaveDuplicates();

        // El código del proveedor reemplaza al interno; no puede repetir el de otra talla.
        String other = JsonPath.read(withBlue, "$.variants[1].productId");
        api.putWith(s, "/api/v1/product-models/" + modelId + "/variants/" + other, """
                {"barcode":"7701234567891","active":true}
                """).andExpect(status().isOk());
        api.putWith(s, "/api/v1/product-models/" + modelId + "/variants/" + variantId, """
                {"barcode":"7701234567891","active":true}
                """).andExpect(status().isConflict());
    }

    @Test
    void invalidModelsAreRejected() throws Exception {
        Owned owner = api.newTenant("modelo2");
        Session s = owner.tenant();
        String json = """
                {"skuPrefix":"CAM","name":"Camiseta","taxId":"%s","salePrice":40000,"sizeScaleId":"%s",
                 "sizes":%s,"colors":[]}
                """;
        api.postWith(s, "/api/v1/product-models", json.formatted(IVA19, ROPA_LETRAS, "[\"S\",\"M\"]"))
                .andExpect(status().isCreated())
                // Las tallas en letras van sin la "T": "Camiseta S", no "Camiseta TS".
                .andExpect(jsonPath("$.variants[0].name").value("Camiseta S"));
        // Precio en cero: las tallas se venderían gratis
        api.postWith(s, "/api/v1/product-models", json.replace("CAM", "CAM0").replace("40000", "0")
                .formatted(IVA19, ROPA_LETRAS, "[\"S\"]")).andExpect(status().isBadRequest());
        // Prefijo repetido
        api.postWith(s, "/api/v1/product-models", json.formatted(IVA19, ROPA_LETRAS, "[\"S\"]"))
                .andExpect(status().isConflict());
        // Talla que no es de la escala
        api.postWith(s, "/api/v1/product-models", json.replace("CAM", "CAM2").formatted(IVA19, ROPA_LETRAS, "[\"38\"]"))
                .andExpect(status().is(422));
        String model = body(api.getWith(s, "/api/v1/product-models?search=camiseta"));
        String id = JsonPath.read(model, "$.content[0].id");
        // Un modelo sin colores no recibe colores después
        api.postWith(s, "/api/v1/product-models/" + id + "/variants", """
                {"sizes":["L"],"colors":["Rojo"]}
                """).andExpect(status().is(422));
        // La escala no puede perder una talla que ya se usa
        api.putWith(s, "/api/v1/size-scales/" + ROPA_LETRAS, """
                {"name":"Ropa (letras)","sizes":[{"label":"M"},{"label":"L","equivalent":"EU 40"}]}
                """).andExpect(status().is(422));
        api.putWith(s, "/api/v1/size-scales/" + ROPA_LETRAS, """
                {"name":"Ropa (letras)","sizes":[{"label":"S"},{"label":"M","equivalent":"EU 38"},{"label":"L"}]}
                """).andExpect(status().isOk())
                .andExpect(jsonPath("$.sizes[1].equivalent").value("EU 38"));
    }

    @Test
    void balancesOfSeveralVariantsInOneCall() throws Exception {
        Owned owner = api.newTenant("modelo3");
        Session s = owner.tenant();
        String shoes = JsonPath.read(body(api.postWith(s, "/api/v1/categories", """
                {"name":"Calzado"}
                """).andExpect(status().isCreated())), "$.id");
        String model = body(api.postWith(s, "/api/v1/product-models", """
                {"skuPrefix":"SAN","name":"Sandalia","taxId":"%s","salePrice":50000,"sizeScaleId":"%s",
                 "categoryId":"%s","sizes":["36","37"],"colors":[]}
                """.formatted(IVA19, CALZADO_CO, shoes)).andExpect(status().isCreated()));
        // El POS pide los modelos de cada categoría.
        api.getWith(s, "/api/v1/product-models?categoryId=" + shoes).andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/product-models?categoryId=" + UUID.randomUUID())
                .andExpect(jsonPath("$.totalElements").value(0));
        String v36 = JsonPath.read(model, "$.variants[0].productId");
        String v37 = JsonPath.read(model, "$.variants[1].productId");
        UUID principal = api.principalBranchId(s);
        api.postWith(s, "/api/v1/inventory/initial-balances", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":4,"unitCost":20000}]}
                """.formatted(principal, v36)).andExpect(status().isCreated());
        String balances = body(api.getWith(s, "/api/v1/inventory/balances?branchId=" + principal
                + "&productIds=" + v36 + "," + v37).andExpect(status().isOk()));
        assertThat((List<?>) JsonPath.read(balances, "$")).hasSize(2);
        assertThat(new BigDecimal(JsonPath.read(balances, "$[0].quantity").toString())).isEqualByComparingTo("4");
        assertThat(new BigDecimal(JsonPath.read(balances, "$[1].quantity").toString())).isEqualByComparingTo("0");
    }

    private static String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }
}
