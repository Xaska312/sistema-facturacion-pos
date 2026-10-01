package com.poshibrido.catalog;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ProductImportIT extends IntegrationTest {

    /** Formato típico de Excel en español: BOM, punto y coma, coma decimal y miles con punto. */
    private static final String VALID = """
            \uFEFFSKU;Nombre;Código de barras;Categoría;Unidad;Impuesto;Costo;Precio;Controla inventario
            GAS-400;Gaseosa 400 ml;7701111111111;Bebidas;UND;IVA19;1.200;2.500;si
            ARR-1K;Arroz 1 kg;7702222222222;Granos;und;iva5;3.100,50;4.200;si
            BOL-1;Bolsa;;;UND;EXCLUIDO;0;100;no
            """;

    @Test
    void dryRunValidatesWithoutWriting() throws Exception {
        Owned owner = api.newTenant("imp");
        api.upload(owner.tenant(), "/api/v1/products/import", bytes(VALID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRows").value(3))
                .andExpect(jsonPath("$.toCreate").value(3))
                .andExpect(jsonPath("$.errors.length()").value(0))
                .andExpect(jsonPath("$.applied").value(false));
        api.getWith(owner.tenant(), "/api/v1/products").andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void importCreatesProductsAndCategoriesThenUpdatesBySku() throws Exception {
        Owned owner = api.newTenant("imp2");
        api.upload(owner.tenant(), "/api/v1/products/import", bytes(VALID), "dryRun", "false")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(true))
                .andExpect(jsonPath("$.newCategories.length()").value(2));

        String rice = api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7702222222222")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        CatalogIT.assertNumber(rice, "$.price", "4200");
        assertThat((String) JsonPath.read(rice, "$.taxType")).isEqualTo("IVA");
        api.getWith(owner.tenant(), "/api/v1/products?search=BOL-1")
                .andExpect(jsonPath("$.content[0].trackInventory").value(false))
                .andExpect(jsonPath("$.content[0].taxCode").value("EXCLUIDO"));
        List<String> categories = JsonPath.read(api.getWith(owner.tenant(), "/api/v1/categories")
                .andReturn().getResponse().getContentAsString(), "$[*].name");
        assertThat(categories).containsExactlyInAnyOrder("Bebidas", "Granos");

        // Segunda carga: actualiza precio por SKU y agrega un código nuevo
        String update = """
                sku,nombre,codigo_barras,unidad,impuesto,precio
                GAS-400,Gaseosa 400 ml,7703333333333,UND,IVA19,2700
                """;
        api.upload(owner.tenant(), "/api/v1/products/import", bytes(update), "dryRun", "false")
                .andExpect(jsonPath("$.toUpdate").value(1))
                .andExpect(jsonPath("$.applied").value(true));
        String soda = api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7703333333333")
                .andReturn().getResponse().getContentAsString();
        CatalogIT.assertNumber(soda, "$.price", "2700");
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7701111111111").andExpect(status().isOk());
    }

    @Test
    void anyErrorMeansNothingIsWrittenAndEveryRowIsReported() throws Exception {
        Owned owner = api.newTenant("imp3");
        String withErrors = """
                sku;nombre;unidad;impuesto;precio;controla_inventario
                OK-1;Producto bueno;UND;IVA19;1000;si
                ;Sin SKU;UND;IVA19;1000;si
                MAL-2;Unidad rara;CAJITA;IVA19;1000;si
                MAL-3;Sin impuesto;UND;;1000;si
                MAL-4;Precio malo;UND;IVA19;abc;si
                OK-1;Repetido;UND;IVA19;1000;si
                MAL-5;Inventario raro;UND;IVA19;1000;quizas
                """;
        String report = api.upload(owner.tenant(), "/api/v1/products/import", bytes(withErrors), "dryRun", "false")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(false))
                .andReturn().getResponse().getContentAsString();
        List<Integer> rows = JsonPath.read(report, "$.errors[*].row");
        assertThat(rows).containsExactly(3, 4, 5, 6, 7, 8);
        api.getWith(owner.tenant(), "/api/v1/products").andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void barcodeOwnedByAnotherProductIsAnError() throws Exception {
        Owned owner = api.newTenant("imp4");
        api.postWith(owner.tenant(), "/api/v1/products",
                CatalogFixtures.simpleProduct("EXIST-1", "Existente", "1000", "7709999999999"))
                .andExpect(status().isCreated());
        String csv = """
                sku;nombre;codigo_barras;impuesto;precio
                NUEVO-1;Nuevo;7709999999999;IVA19;500
                """;
        api.upload(owner.tenant(), "/api/v1/products/import", bytes(csv), "dryRun", "false")
                .andExpect(jsonPath("$.errors[0].row").value(2))
                .andExpect(jsonPath("$.applied").value(false));
    }

    @Test
    void badFilesAreRejected() throws Exception {
        Owned owner = api.newTenant("imp5");
        api.upload(owner.tenant(), "/api/v1/products/import", bytes("nombre;precio\nX;1\n"))
                .andExpect(status().is(422));
        api.upload(owner.tenant(), "/api/v1/products/import", bytes("sku;nombre;impuesto;precio\n"))
                .andExpect(status().is(422));
        byte[] latin1 = "sku;nombre;impuesto;precio\nA;Café;IVA19;1\n".getBytes(StandardCharsets.ISO_8859_1);
        api.upload(owner.tenant(), "/api/v1/products/import", latin1).andExpect(status().is(422));
    }

    @Test
    void importRequiresProductsManage() throws Exception {
        Owned owner = api.newTenant("imp6");
        Joined cashier = api.joinAs(owner.tenant(), owner.tenantId(), "CASHIER");
        api.upload(cashier.session(), "/api/v1/products/import", bytes(VALID)).andExpect(status().isForbidden());
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }
}
