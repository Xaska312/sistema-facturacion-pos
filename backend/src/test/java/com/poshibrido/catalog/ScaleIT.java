package com.poshibrido.catalog;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Fase 8e: etiquetas de báscula (EAN-13 con prefijo 2) en el lector del POS. */
class ScaleIT extends IntegrationTest {

    static final String IVA19 = "01920000-0000-7000-8000-000000000401";
    static final String KG = "01920000-0000-7000-8000-000000000302";

    @Test
    void weightAndPriceLabelsGiveTheQuantity() throws Exception {
        Session s = api.newTenant("bascula").tenant();
        String cheese = JsonPath.read(body(api.postWith(s, "/api/v1/products", """
                {"sku":"QUESO","name":"Queso campesino","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":20000,
                 "trackInventory":true,"barcodes":[]}""".formatted(KG, IVA19)).andExpect(status().isCreated())), "$.id");
        String soda = JsonPath.read(body(api.postWith(s, "/api/v1/products",
                CatalogFixturesAccess.simpleProduct("GAS", "Gaseosa", "2500")).andExpect(status().isCreated())), "$.id");

        // Un producto por unidades no va en la báscula; el PLU se guarda sin ceros a la izquierda.
        api.putWith(s, "/api/v1/scale/plus/00123", """
                {"productId":"%s"}""".formatted(soda)).andExpect(status().is(422));
        api.putWith(s, "/api/v1/scale/plus/00123", """
                {"productId":"%s"}""".formatted(cheese)).andExpect(status().isOk())
                .andExpect(jsonPath("$.plu").value("123"));

        String weightLabel = ScaleLabelsTest.ean("200012300750");
        // Apagada, la etiqueta es un código cualquiera: no existe.
        api.getWith(s, "/api/v1/products/lookup?code=" + weightLabel).andExpect(status().isNotFound());

        api.putWith(s, "/api/v1/scale/settings", """
                {"enabled":true,"prefix":"20","pluDigits":5,"kind":"WEIGHT","decimals":3}""")
                .andExpect(status().isOk());
        String weighed = body(api.getWith(s, "/api/v1/products/lookup?code=" + weightLabel)
                .andExpect(status().isOk()).andExpect(jsonPath("$.sku").value("QUESO")));
        assertThat(new BigDecimal(JsonPath.read(weighed, "$.scaleQuantity").toString())).isEqualByComparingTo("0.750");
        // Un código normal no trae cantidad.
        api.getWith(s, "/api/v1/products/lookup?code=GAS").andExpect(jsonPath("$.scaleQuantity").value(nullValue()));
        // PLU sin asignar
        api.getWith(s, "/api/v1/products/lookup?code=" + ScaleLabelsTest.ean("200099900750"))
                .andExpect(status().isNotFound());

        // Etiqueta con precio: llega el valor ($5.000); la pantalla calcula la cantidad con el IVA y la lista.
        api.putWith(s, "/api/v1/scale/settings", """
                {"enabled":true,"prefix":"2","pluDigits":4,"kind":"PRICE","decimals":0}""").andExpect(status().isOk());
        String priced = body(api.getWith(s, "/api/v1/products/lookup?code=" + ScaleLabelsTest.ean("201230005000"))
                .andExpect(status().isOk()));
        assertThat(new BigDecimal(JsonPath.read(priced, "$.scaleAmount").toString())).isEqualByComparingTo("5000");
        assertThat((Object) JsonPath.read(priced, "$.scaleQuantity")).isNull();
        // Otro producto no puede quedarse con un PLU ajeno.
        String ham = JsonPath.read(body(api.postWith(s, "/api/v1/products", """
                {"sku":"JAMON","name":"Jamón","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":30000,
                 "trackInventory":true,"barcodes":[]}""".formatted(KG, IVA19)).andExpect(status().isCreated())), "$.id");
        api.putWith(s, "/api/v1/scale/plus/123", """
                {"productId":"%s"}""".formatted(ham)).andExpect(status().isConflict());

        // Prefijo de los códigos internos y formatos imposibles
        api.putWith(s, "/api/v1/scale/settings", """
                {"enabled":true,"prefix":"29","pluDigits":5,"kind":"WEIGHT","decimals":3}""").andExpect(status().is(422));
        api.putWith(s, "/api/v1/scale/settings", """
                {"enabled":true,"prefix":"2","pluDigits":3,"kind":"WEIGHT","decimals":3}""").andExpect(status().is(422));

        api.deleteWith(s, "/api/v1/scale/plus/123").andExpect(status().isNoContent());
        api.getWith(s, "/api/v1/scale/plus").andExpect(jsonPath("$.length()").value(0));
    }

    private static String body(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }
}
