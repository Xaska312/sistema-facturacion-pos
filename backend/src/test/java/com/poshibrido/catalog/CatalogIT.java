package com.poshibrido.catalog;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.catalog.application.Ean13;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static com.poshibrido.catalog.CatalogFixtures.CJ;
import static com.poshibrido.catalog.CatalogFixtures.EXENTO;
import static com.poshibrido.catalog.CatalogFixtures.GENERAL;
import static com.poshibrido.catalog.CatalogFixtures.IVA19;
import static com.poshibrido.catalog.CatalogFixtures.KG;
import static com.poshibrido.catalog.CatalogFixtures.PAQ;
import static com.poshibrido.catalog.CatalogFixtures.UND;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CatalogIT extends IntegrationTest {

    @Test
    void seedsAreAvailableInEveryNewBusiness() throws Exception {
        Owned owner = api.newTenant("cat");
        List<String> units = JsonPath.read(body(api.getWith(owner.tenant(), "/api/v1/units")), "$[*].code");
        assertThat(units).contains("UND", "KG", "LT", "CJ", "PAQ");
        List<String> taxes = JsonPath.read(body(api.getWith(owner.tenant(), "/api/v1/taxes")), "$[*].code");
        assertThat(taxes).containsExactlyInAnyOrder("IVA19", "IVA5", "EXENTO", "EXCLUIDO");
        api.getWith(owner.tenant(), "/api/v1/price-lists")
                .andExpect(jsonPath("$[0].code").value("GENERAL"))
                .andExpect(jsonPath("$[0].defaultList").value(true));
    }

    @Test
    void categoryTreeRules() throws Exception {
        Owned owner = api.newTenant("cat2");
        UUID drinks = id(api.postWith(owner.tenant(), "/api/v1/categories", """
                {"name":"Bebidas"}
                """).andExpect(status().isCreated()));
        UUID sodas = id(api.postWith(owner.tenant(), "/api/v1/categories", """
                {"name":"Gaseosas","parentId":"%s"}
                """.formatted(drinks)).andExpect(status().isCreated()));

        api.postWith(owner.tenant(), "/api/v1/categories", """
                {"name":"gaseosas","parentId":"%s"}
                """.formatted(drinks)).andExpect(status().isConflict());
        // Mismo nombre en otro nivel sí se permite
        api.postWith(owner.tenant(), "/api/v1/categories", """
                {"name":"Gaseosas"}
                """).andExpect(status().isCreated());
        // Ciclo: Bebidas dentro de Gaseosas (su hija)
        api.putWith(owner.tenant(), "/api/v1/categories/" + drinks, """
                {"name":"Bebidas","parentId":"%s"}
                """.formatted(sodas)).andExpect(status().is(422));

        api.postWith(owner.tenant(), "/api/v1/products", """
                {"sku":"COLA-400","name":"Gaseosa cola 400 ml","categoryId":"%s","baseUnitId":"%s","taxId":"%s",
                 "salePrice":2500,"trackInventory":true}
                """.formatted(sodas, UND, IVA19)).andExpect(status().isCreated());
        api.postEmpty(owner.tenant(), "/api/v1/categories/" + sodas + "/deactivate").andExpect(status().isConflict());
    }

    @Test
    void productWithPresentationsBarcodesAndPriceLists() throws Exception {
        Owned owner = api.newTenant("prod");
        UUID wholesale = id(api.postWith(owner.tenant(), "/api/v1/price-lists", """
                {"code":"mayorista","name":"Mayorista"}
                """).andExpect(status().isCreated()).andExpect(jsonPath("$.code").value("MAYORISTA")));

        UUID productId = id(api.postWith(owner.tenant(), "/api/v1/products", """
                {"sku":"agua-600","name":"Agua 600 ml","baseUnitId":"%s","taxId":"%s","cost":800,"salePrice":1500,
                 "trackInventory":true,
                 "conversions":[{"unitId":"%s","factor":24,"salePrice":30000},{"unitId":"%s","factor":6}],
                 "barcodes":[{"barcode":"7700000000017"},{"barcode":"17700000000014","unitId":"%s"}],
                 "listPrices":[{"priceListId":"%s","price":1300}]}
                """.formatted(UND, IVA19, CJ, PAQ, CJ, wholesale))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sku").value("AGUA-600"))
                .andExpect(jsonPath("$.baseUnitCode").value("UND"))
                .andExpect(jsonPath("$.barcodes.length()").value(2))
                .andExpect(jsonPath("$.listPrices[0].priceListName").value("Mayorista")));

        String view = body(api.getWith(owner.tenant(), "/api/v1/products/" + productId));
        assertNumber(view, "$.taxRate", "19");
        List<Object> paqPrice = JsonPath.read(view, "$.conversions[?(@.unitCode == 'PAQ')].effectivePrice");
        assertThat(new BigDecimal(paqPrice.getFirst().toString())).isEqualByComparingTo("9000");

        // Lector de código de barras
        String base = body(api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7700000000017")
                .andExpect(status().isOk()).andExpect(jsonPath("$.unitCode").value("UND")));
        assertNumber(base, "$.factor", "1");
        assertNumber(base, "$.price", "1500");
        String box = body(api.getWith(owner.tenant(), "/api/v1/products/lookup?code=17700000000014")
                .andExpect(jsonPath("$.unitCode").value("CJ")));
        assertNumber(box, "$.factor", "24");
        assertNumber(box, "$.price", "30000");
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=agua-600")
                .andExpect(jsonPath("$.productId").value(productId.toString()));
        String listed = body(api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7700000000017&priceListId=" + wholesale)
                .andExpect(jsonPath("$.fromList").value(true)));
        assertNumber(listed, "$.price", "1300");
        // La lista no tiene precio para la caja: usa el de la General
        String boxListed = body(api.getWith(owner.tenant(), "/api/v1/products/lookup?code=17700000000014&priceListId=" + wholesale)
                .andExpect(jsonPath("$.fromList").value(false)));
        assertNumber(boxListed, "$.price", "30000");
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=NOEXISTE").andExpect(status().isNotFound());

        // SKU y códigos únicos
        api.postWith(owner.tenant(), "/api/v1/products",
                CatalogFixtures.simpleProduct("Agua-600", "Otra", "1", null)).andExpect(status().isConflict());
        api.postWith(owner.tenant(), "/api/v1/products",
                CatalogFixtures.simpleProduct("OTRO-1", "Otro", "1", "17700000000014")).andExpect(status().isConflict());

        // Búsqueda por nombre, SKU y código exacto
        api.getWith(owner.tenant(), "/api/v1/products?search=agua").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(owner.tenant(), "/api/v1/products?search=AGUA-6").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(owner.tenant(), "/api/v1/products?search=7700000000017").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(owner.tenant(), "/api/v1/products?search=leche").andExpect(jsonPath("$.totalElements").value(0));

        // Edición completa: quita el paquete y el código de la caja, cambia el precio y la lista
        api.putWith(owner.tenant(), "/api/v1/products/" + productId, """
                {"sku":"AGUA-600","name":"Agua 600 ml","baseUnitId":"%s","taxId":"%s","cost":800,"salePrice":1600,
                 "trackInventory":true,
                 "conversions":[{"unitId":"%s","factor":24,"salePrice":31000}],
                 "barcodes":[{"barcode":"7700000000017"}],
                 "listPrices":[{"priceListId":"%s","price":1400},{"priceListId":"%s","unitId":"%s","price":29000}]}
                """.formatted(UND, IVA19, CJ, wholesale, wholesale, CJ))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conversions.length()").value(1))
                .andExpect(jsonPath("$.barcodes.length()").value(1))
                .andExpect(jsonPath("$.listPrices.length()").value(2));
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=17700000000014").andExpect(status().isNotFound());
        // El código liberado puede usarlo otro producto
        api.postWith(owner.tenant(), "/api/v1/products",
                CatalogFixtures.simpleProduct("OTRO-1", "Otro", "1", "17700000000014")).andExpect(status().isCreated());

        // Inactivo: no se vende
        api.postEmpty(owner.tenant(), "/api/v1/products/" + productId + "/deactivate").andExpect(status().isOk());
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7700000000017").andExpect(status().is(422));
        api.getWith(owner.tenant(), "/api/v1/products?search=agua").andExpect(jsonPath("$.totalElements").value(0));
        api.getWith(owner.tenant(), "/api/v1/products?search=agua&includeInactive=true")
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void internalBarcodesAreValidUniqueEan13() throws Exception {
        Owned owner = api.newTenant("ean");
        String first = JsonPath.read(body(api.postEmpty(owner.tenant(), "/api/v1/barcodes/internal")
                .andExpect(status().isOk())), "$.barcode");
        String second = JsonPath.read(body(api.postEmpty(owner.tenant(), "/api/v1/barcodes/internal")), "$.barcode");
        assertThat(first).startsWith("29").hasSize(13).isNotEqualTo(second);
        assertThat(Ean13.isValid(first)).isTrue();
        assertThat(Ean13.isValid(second)).isTrue();

        api.postWith(owner.tenant(), "/api/v1/products", """
                {"sku":"PAN-1","name":"Pan de la casa","baseUnitId":"%s","taxId":"%s","salePrice":500,
                 "trackInventory":false,"barcodes":[{"barcode":"%s","internal":true}]}
                """.formatted(UND, EXENTO, first))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.barcodes[0].internal").value(true));
    }

    @Test
    void catalogValidationRules() throws Exception {
        Owned owner = api.newTenant("val");
        // Código de barras de una unidad que no es presentación
        api.postWith(owner.tenant(), "/api/v1/products", """
                {"sku":"X1","name":"X","baseUnitId":"%s","taxId":"%s","salePrice":1,"trackInventory":true,
                 "barcodes":[{"barcode":"123","unitId":"%s"}]}
                """.formatted(UND, IVA19, KG)).andExpect(status().is(422));
        // Presentación con la unidad base
        api.postWith(owner.tenant(), "/api/v1/products", """
                {"sku":"X2","name":"X","baseUnitId":"%s","taxId":"%s","salePrice":1,"trackInventory":true,
                 "conversions":[{"unitId":"%s","factor":2}]}
                """.formatted(UND, IVA19, UND)).andExpect(status().is(422));
        // Precio en la lista General
        api.postWith(owner.tenant(), "/api/v1/products", """
                {"sku":"X3","name":"X","baseUnitId":"%s","taxId":"%s","salePrice":1,"trackInventory":true,
                 "listPrices":[{"priceListId":"%s","price":1}]}
                """.formatted(UND, IVA19, GENERAL)).andExpect(status().is(422));
        // Precio negativo y código de barras inválido
        api.postWith(owner.tenant(), "/api/v1/products", CatalogFixtures.simpleProduct("X4", "X", "-1", null))
                .andExpect(status().isBadRequest());
        api.postWith(owner.tenant(), "/api/v1/products", CatalogFixtures.simpleProduct("X5", "X", "1", "ab cd"))
                .andExpect(status().is(422));

        // Impuestos
        api.postWith(owner.tenant(), "/api/v1/taxes", """
                {"code":"EXENTO2","name":"Exento 2","type":"EXEMPT","rate":5}
                """).andExpect(status().is(422));
        api.postWith(owner.tenant(), "/api/v1/taxes", """
                {"code":"IVA0","name":"IVA 0","type":"IVA","rate":0}
                """).andExpect(status().is(422));
        api.postWith(owner.tenant(), "/api/v1/taxes", """
                {"code":"inc8","name":"INC 8 %","type":"INC","rate":8}
                """).andExpect(status().isCreated()).andExpect(jsonPath("$.code").value("INC8"));

        // Unidades
        api.postWith(owner.tenant(), "/api/v1/units", """
                {"code":"und","name":"Repetida","allowsDecimals":false}
                """).andExpect(status().isConflict());
        api.postWith(owner.tenant(), "/api/v1/products", CatalogFixtures.simpleProduct("USA-UND", "Usa UND", "1", null))
                .andExpect(status().isCreated());
        api.postEmpty(owner.tenant(), "/api/v1/units/" + UND + "/deactivate").andExpect(status().isConflict());
        api.postEmpty(owner.tenant(), "/api/v1/taxes/" + IVA19 + "/deactivate").andExpect(status().isConflict());
        api.postEmpty(owner.tenant(), "/api/v1/units/" + KG + "/deactivate").andExpect(status().isOk());

        // La lista General no se desactiva
        api.postEmpty(owner.tenant(), "/api/v1/price-lists/" + GENERAL + "/deactivate").andExpect(status().is(422));
    }

    private static String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }

    private static UUID id(ResultActions result) throws Exception {
        return UUID.fromString(JsonPath.read(body(result), "$.id"));
    }

    static void assertNumber(String json, String path, String expected) {
        Object value = JsonPath.read(json, path);
        assertThat(new BigDecimal(String.valueOf(value))).as(path).isEqualByComparingTo(expected);
    }
}
