package com.poshibrido.catalog;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static com.poshibrido.catalog.CatalogFixtures.IVA19;
import static com.poshibrido.catalog.CatalogFixtures.UND;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Eliminar productos y categorías (decisión 314): el producto queda oculto para siempre y suelta su SKU y sus códigos
 * de barras; la categoría se borra solo si no tiene productos.
 */
class ProductDeleteIT extends IntegrationTest {

    private static UUID id(ResultActions r) throws Exception {
        return UUID.fromString(JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.id"));
    }

    @Test
    void aDeletedProductDisappearsAndFreesItsSkuAndBarcode() throws Exception {
        Owned owner = api.newTenant("borrar");
        Session s = owner.tenant();
        UUID cat = id(api.postWith(s, "/api/v1/categories", "{\"name\":\"Bebidas\"}").andExpect(status().isCreated()));
        String product = """
                {"sku":"AGUA-600","name":"Agua 600 ml","categoryId":"%s","baseUnitId":"%s","taxId":"%s","salePrice":1500,
                 "trackInventory":true,"barcodes":[{"barcode":"7700000000017"}]}""".formatted(cat, UND, IVA19);
        UUID agua = id(api.postWith(s, "/api/v1/products", product).andExpect(status().isCreated()));

        // Con productos, la categoría no se borra.
        api.deleteWith(s, "/api/v1/categories/" + cat).andExpect(status().isConflict());

        api.deleteWith(s, "/api/v1/products/" + agua).andExpect(status().isNoContent());
        api.deleteWith(s, "/api/v1/products/" + agua).andExpect(status().isNoContent());
        api.getWith(s, "/api/v1/products?search=AGUA-600&includeInactive=true")
                .andExpect(jsonPath("$.content.length()").value(0));
        api.getWith(s, "/api/v1/products/" + agua).andExpect(status().isNotFound());
        api.postEmpty(s, "/api/v1/products/" + agua + "/activate").andExpect(status().isNotFound());
        // El SKU y el código de barras quedan libres.
        api.postWith(s, "/api/v1/products", product).andExpect(status().isCreated());

        UUID otra = id(api.postWith(s, "/api/v1/categories", "{\"name\":\"Vacía\"}").andExpect(status().isCreated()));
        UUID hija = id(api.postWith(s, "/api/v1/categories", "{\"name\":\"Hija\",\"parentId\":\"%s\"}".formatted(otra))
                .andExpect(status().isCreated()));
        api.deleteWith(s, "/api/v1/categories/" + otra).andExpect(status().isConflict());
        api.deleteWith(s, "/api/v1/categories/" + hija).andExpect(status().isNoContent());
        api.deleteWith(s, "/api/v1/categories/" + otra).andExpect(status().isNoContent());
        api.getWith(s, "/api/v1/categories").andExpect(jsonPath("$[?(@.name == 'Vacía')]").isEmpty());
    }
}
