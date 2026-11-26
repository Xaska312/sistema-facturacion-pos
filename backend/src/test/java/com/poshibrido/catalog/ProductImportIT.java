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
        // Solo "Varios", que trae todo negocio (decisión 253): la carga no creó nada.
        api.getWith(owner.tenant(), "/api/v1/products").andExpect(jsonPath("$.totalElements").value(1));
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
        // Solo "Varios", que trae todo negocio (decisión 253): la carga no creó nada.
        api.getWith(owner.tenant(), "/api/v1/products").andExpect(jsonPath("$.totalElements").value(1));
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

    /** Fase 8f: la plantilla de Excel se descarga y, llena, se importa igual que un CSV. */
    @Test
    void excelTemplateCanBeDownloadedAndImported() throws Exception {
        Owned owner = api.newTenant("excel");
        byte[] template = api.getWith(owner.tenant(), "/api/v1/products/import/template")
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(new String(template, 0, 2, StandardCharsets.US_ASCII)).isEqualTo("PK");
        // La plantilla trae dos productos de ejemplo: se validan y se importan tal cual.
        api.upload(owner.tenant(), "/api/v1/products/import", template)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.toCreate").value(2))
                .andExpect(jsonPath("$.errors.length()").value(0));
        api.upload(owner.tenant(), "/api/v1/products/import", template, "dryRun", "false")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(true));
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7701234567890")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sku").value("GAS-400"));
        // Un archivo que parece Excel pero está dañado
        api.upload(owner.tenant(), "/api/v1/products/import", new byte[] {'P', 'K', 3, 4, 0, 0, 0})
                .andExpect(status().is(422));
    }

    /** Decisión 381: el precio mayorista (o de otra lista) se carga con una columna precio_<lista>. */
    @Test
    void listPricesComeFromPriceColumnsAndTheListIsCreated() throws Exception {
        Owned owner = api.newTenant("mayor");
        String file = """
                sku,nombre,codigo_barras,impuesto,precio,precio_mayorista
                ARR-1K,Arroz 1 kg,7704444444444,IVA5,4200,3900
                SAL-1,Sal 1 kg,7705555555555,EXCLUIDO,1500,
                """;
        api.upload(owner.tenant(), "/api/v1/products/import", bytes(file), "dryRun", "false")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(true))
                .andExpect(jsonPath("$.newPriceLists[0]").value("MAYORISTA"));
        String lists = api.getWith(owner.tenant(), "/api/v1/price-lists").andReturn().getResponse().getContentAsString();
        String mayorista = ((List<String>) JsonPath.read(lists, "$[?(@.code == 'MAYORISTA')].id")).getFirst();
        assertThat(((List<String>) JsonPath.read(lists, "$[?(@.code == 'MAYORISTA')].name")).getFirst())
                .isEqualTo("Mayorista");
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7704444444444&priceListId=" + mayorista)
                .andExpect(jsonPath("$.price").value(3900.0)).andExpect(jsonPath("$.fromList").value(true));
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7705555555555&priceListId=" + mayorista)
                .andExpect(jsonPath("$.price").value(1500.0)).andExpect(jsonPath("$.fromList").value(false));

        // Se actualiza el precio mayorista; la lista ya existe y una celda vacía no lo cambia.
        api.upload(owner.tenant(), "/api/v1/products/import", bytes("""
                sku,nombre,impuesto,precio,Precio Mayorista
                ARR-1K,Arroz 1 kg,IVA5,4300,3800
                """), "dryRun", "false").andExpect(jsonPath("$.newPriceLists.length()").value(0));
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7704444444444&priceListId=" + mayorista)
                .andExpect(jsonPath("$.price").value(3800.0));
        api.upload(owner.tenant(), "/api/v1/products/import", bytes("""
                sku,nombre,impuesto,precio,precio_mayorista
                ARR-1K,Arroz 1 kg,IVA5,4300,
                """), "dryRun", "false").andExpect(jsonPath("$.applied").value(true));
        api.getWith(owner.tenant(), "/api/v1/products/lookup?code=7704444444444&priceListId=" + mayorista)
                .andExpect(jsonPath("$.price").value(3800.0));

        // Errores: un precio que no es número, y la columna de la lista General.
        api.upload(owner.tenant(), "/api/v1/products/import", bytes("""
                sku,nombre,impuesto,precio,precio_mayorista
                ARR-1K,Arroz 1 kg,IVA5,4300,barato
                """)).andExpect(jsonPath("$.errors[0].message").value(org.hamcrest.Matchers.containsString(
                "lista MAYORISTA")));
        api.upload(owner.tenant(), "/api/v1/products/import", bytes("""
                sku,nombre,impuesto,precio,precio_general
                ARR-1K,Arroz 1 kg,IVA5,4300,4000
                """)).andExpect(status().is(422));

        // La plantilla ya trae la columna de la lista y se importa tal cual.
        byte[] template = api.getWith(owner.tenant(), "/api/v1/products/import/template")
                .andReturn().getResponse().getContentAsByteArray();
        api.upload(owner.tenant(), "/api/v1/products/import", template)
                .andExpect(jsonPath("$.errors.length()").value(0))
                .andExpect(jsonPath("$.newPriceLists.length()").value(0));
    }

    /**
     * Decisión 382: "Descargar mis productos" sale en el formato de la plantilla, con el precio mayorista y la
     * existencia, y subir el mismo archivo no cambia nada (ni le quita el IVA al costo dos veces).
     */
    @Test
    void exportedProductsComeBackUnchanged() throws Exception {
        Owned owner = api.newTenant("exporta");
        var s = owner.tenant();
        api.upload(s, "/api/v1/products/import", bytes("""
                sku,nombre,codigo_barras,categoria,impuesto,costo,precio,controla_inventario,precio_mayorista
                ARR-1K,Arroz 1 kg,0770444444444,Granos,IVA5,3000,4200,si,3900
                BOLSA,Bolsa,,,EXCLUIDO,50,100,no,
                """), "dryRun", "false").andExpect(jsonPath("$.applied").value(true));
        String arroz = productId(s, "ARR-1K");
        api.postWith(s, "/api/v1/inventory/initial-balances", """
                {"branchId":"%s","lines":[{"productId":"%s","quantity":12,"unitCost":3000}]}
                """.formatted(api.principalBranchId(s), arroz)).andExpect(status().isCreated());
        java.math.BigDecimal cost = productCost(s, "ARR-1K");
        String settings = api.getWith(s, "/api/v1/settings").andReturn().getResponse().getContentAsString();
        api.putWith(s, "/api/v1/settings", settings.replaceFirst("\"costsIncludeTax\":(true|false)",
                "\"costsIncludeTax\":true")).andExpect(status().isOk());

        byte[] file = api.getWith(s, "/api/v1/products/export").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        List<com.poshibrido.shared.xlsx.XlsxReader.Row> rows = com.poshibrido.shared.xlsx.XlsxReader.firstSheet(file);
        List<String> header = rows.getFirst().cells();
        assertThat(header).containsSequence("sku", "nombre", "codigo_barras", "categoria", "unidad", "impuesto",
                "costo", "precio", "controla_inventario", "descripcion").contains("precio_mayorista", "existencia");
        List<String> rice = rows.stream().map(com.poshibrido.shared.xlsx.XlsxReader.Row::cells)
                .filter(c -> c.getFirst().equals("ARR-1K")).findFirst().orElseThrow();
        assertThat(rice.get(2)).isEqualTo("0770444444444");
        assertThat(rice.get(3)).isEqualTo("Granos");
        // El costo sale con IVA (como se escribe con el ajuste encendido).
        assertThat(new java.math.BigDecimal(rice.get(6))).isEqualByComparingTo(
                cost.multiply(new java.math.BigDecimal("1.05")).setScale(2, java.math.RoundingMode.HALF_UP));
        assertThat(rice.get(header.indexOf("precio_mayorista"))).isEqualTo("3900");
        assertThat(rice.get(header.indexOf("existencia"))).isEqualTo("12");
        List<String> bag = rows.stream().map(com.poshibrido.shared.xlsx.XlsxReader.Row::cells)
                .filter(c -> c.getFirst().equals("BOLSA")).findFirst().orElseThrow();
        assertThat(bag.size() > header.indexOf("existencia") ? bag.get(header.indexOf("existencia")) : "").isEmpty();

        // Se sube tal cual: se actualizan todos (también el de ejemplo del negocio nuevo) y el costo queda igual.
        api.upload(s, "/api/v1/products/import", file, "dryRun", "false")
                .andExpect(jsonPath("$.errors.length()").value(0))
                .andExpect(jsonPath("$.toUpdate").value(rows.size() - 1))
                .andExpect(jsonPath("$.toCreate").value(0));
        assertThat(productCost(s, "ARR-1K")).isEqualByComparingTo(cost);

        // El cajero no lo descarga (trae costos).
        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        api.getWith(cashier.session(), "/api/v1/products/export").andExpect(status().isForbidden());
    }

    private String productId(com.poshibrido.support.TestApi.Session s, String sku) throws Exception {
        String page = api.getWith(s, "/api/v1/products?search=" + sku).andReturn().getResponse().getContentAsString();
        return ((List<String>) JsonPath.read(page, "$.content[?(@.sku == '" + sku + "')].id")).getFirst();
    }

    private java.math.BigDecimal productCost(com.poshibrido.support.TestApi.Session s, String sku) throws Exception {
        String product = api.getWith(s, "/api/v1/products/" + productId(s, sku)).andReturn().getResponse()
                .getContentAsString();
        return new java.math.BigDecimal(JsonPath.read(product, "$.cost").toString());
    }
}
