package com.poshibrido.catalog;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.List;

import static com.poshibrido.sales.PosTestSupport.body;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Crear desde la factura lo que falta (decisión 301): productos simples y referencias con tallas en un solo paso, con
 * la cantidad de cada talla; otra curva de la misma referencia agrega solo las tallas que falten; todo o nada.
 */
class InvoiceProductsIT extends IntegrationTest {

    static final String CALZADO_CO = ProductModelIT.CALZADO_CO;

    @Test
    void createsSimpleProductsAndModelsWithSizesFromTheInvoice() throws Exception {
        Owned owner = api.newTenant("desde-factura");
        Session s = owner.tenant();
        String json = body(api.postWith(s, "/api/v1/products/from-invoice", """
                {"items":[
                 {"lineNo":1,"sku":"CORD-01","name":"Cordones negros 120 cm","category":"Accesorios","unitCode":"UND",
                  "taxCode":"IVA19","cost":2000,"price":5000,"barcode":"7701234567895"},
                 {"lineNo":2,"sku":"REF123","name":"Tenis Urban","category":"Calzado","taxCode":"IVA19","cost":60000,
                  "price":120000,"sizeScaleId":"%s","color":"Negro",
                  "sizes":[{"size":"36","quantity":1},{"size":"37","quantity":2},{"size":"38","quantity":2},
                           {"size":"39","quantity":1},{"size":"40","quantity":0}]}]}""".formatted(CALZADO_CO))
                .andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(json, "$.lines[0].lineNo")).isEqualTo(1);
        assertThat((String) JsonPath.read(json, "$.lines[0].products[0].sku")).isEqualTo("CORD-01");
        List<String> sizes = JsonPath.read(json, "$.lines[1].products[*].size");
        assertThat(sizes).containsExactly("36", "37", "38", "39");
        List<Integer> quantities = JsonPath.read(json, "$.lines[1].products[*].quantity");
        assertThat(quantities).containsExactly(1, 2, 2, 1);
        String modelList = body(api.getWith(s, "/api/v1/product-models?search=REF123").andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(modelList, "$.content[0].variants")).isEqualTo(4);
        // La categoría se crea una sola vez y el código de barras queda en el producto.
        api.getWith(s, "/api/v1/products?search=7701234567895").andExpect(jsonPath("$.content[0].name")
                .value("Cordones negros 120 cm"));

        // Otra curva de la misma referencia: solo se agregan las tallas que faltan (40 y 41).
        json = body(api.postWith(s, "/api/v1/products/from-invoice", """
                {"items":[{"lineNo":1,"sku":"ref123","name":"Tenis Urban","taxCode":"IVA19","cost":60000,"price":120000,
                  "sizeScaleId":"%s","color":"negro","sizes":[{"size":"38","quantity":3},{"size":"40","quantity":2},
                  {"size":"41","quantity":1}]}]}""".formatted(CALZADO_CO)).andExpect(status().isOk()));
        assertThat((List<String>) JsonPath.read(json, "$.lines[0].products[*].size")).containsExactly("38", "40", "41");
        modelList = body(api.getWith(s, "/api/v1/product-models?search=REF123"));
        assertThat((Integer) JsonPath.read(modelList, "$.content[0].variants")).isEqualTo(6);

        // Todo o nada: si una línea falla no se crea ninguna, y el mensaje dice cuál.
        api.postWith(s, "/api/v1/products/from-invoice", """
                {"items":[{"lineNo":1,"sku":"OK-1","name":"Plantillas","unitCode":"UND","taxCode":"IVA19","cost":1000,
                  "price":3000},
                 {"lineNo":2,"sku":"MAL-1","name":"Sin impuesto","unitCode":"UND","taxCode":"","cost":1000,"price":3000}]}""")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("«Sin impuesto»: elige el impuesto."));
        api.getWith(s, "/api/v1/products?search=OK-1").andExpect(jsonPath("$.content.length()").value(0));
    }
}
