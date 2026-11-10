package com.poshibrido.ai;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.IVA19;
import static com.poshibrido.sales.PosTestSupport.UND;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * "Cargar con Aska" (decisión 300): la lista de precios del proveedor (leída por la IA simulada) se empareja con los
 * productos; los nuevos salen con el margen del negocio y los existentes conservan su margen con el costo nuevo.
 * Nada se guarda hasta confirmar, y al confirmar se recuerdan los códigos del proveedor.
 */
class CatalogImportIT extends IntegrationTest {

    @MockitoBean
    private AnthropicMessages ai;

    @Test
    void readsSupplierListProposesAndAppliesReviewedRows() throws Exception {
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        Owned owner = api.newTenant("cargar-aska");
        Session s = owner.tenant();
        // Arroz: costo 2.000, precio 3.570 con IVA 19 % → 3.000 sin IVA → margen 33,3 %.
        UUID arroz = id(api.postWith(s, "/api/v1/products", """
                {"sku":"ARROZ-1","name":"Arroz Diana 1 kg","baseUnitId":"%s","taxId":"%s","cost":2000,"salePrice":3570,
                 "barcodes":[{"barcode":"7702511000014"}]}""".formatted(UND, IVA19)).andExpect(status().isCreated()), "$.id");
        UUID supplier = id(api.postWith(s, "/api/v1/suppliers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"%d","firstNames":"Granos","lastNames":"del Tolima"}"""
                .formatted(30_000_000 + (System.nanoTime() % 60_000_000))).andExpect(status().isCreated()), "$.id");
        byte[] csv = "Codigo;Producto;Precio\n7702511000014;Arroz Diana 1 kg;2400\nFR-500;Frijol bola roja 500 g;4000\n"
                .getBytes(StandardCharsets.UTF_8);

        // Solo con XASKA IA.
        api.uploadNamed(s, "/api/v1/ai/catalog/read", "files", "lista.csv", csv).andExpect(status().isForbidden());
        Session admin = platformAdmin();
        api.putWith(admin, "/api/v1/platform/tenants/%s/subscription/extras".formatted(owner.tenantId()),
                "{\"modules\":[],\"features\":[\"AI\"],\"branches\":0,\"registers\":0,\"users\":0}").andExpect(status().isOk());
        s = TestApi.session(api.refreshRaw(s.refreshToken()).andExpect(status().isOk()).andReturn());
        api.getWith(s, "/api/v1/ai/catalog/usage").andExpect(jsonPath("$.limit").value(20))
                .andExpect(jsonPath("$.used").value(0));

        String read = """
                {"readable":true,"problem":"","pricesIncludeTax":false,"items":[
                 {"description":"Arroz Diana 1 kg","supplierCode":"","barcode":"7702511000014","unit":"UND","cost":2400,
                  "taxRate":19,"category":"Granos"},
                 {"description":"Frijol bola roja 500 g","supplierCode":"FR-500","barcode":"","unit":"unidad","cost":4000,
                  "taxRate":5,"category":"Granos"},
                 {"description":"Sin precio","supplierCode":"X","barcode":"","unit":"UND","cost":0,"taxRate":-1,
                  "category":""}]}""";
        doReturn(Map.of("stop_reason", "end_turn", "usage", Map.of("input_tokens", 900, "output_tokens", 300),
                "content", List.of(Map.of("type", "text", "text", read)))).when(ai).send(any());
        String json = body(api.uploadNamed(s, "/api/v1/ai/catalog/read", "files", "lista.csv", csv,
                "supplierId", supplier.toString(), "margin", "30").andExpect(status().isOk()));
        // Decisión 313: el que no trae costo también entra, sin precio, para escribirlo en la revisión.
        assertThat((List<Object>) JsonPath.read(json, "$.rows")).hasSize(3);
        assertThat((String) JsonPath.read(json, "$.rows[2].proposal.action")).isEqualTo("CREATE");
        assertThat((Object) JsonPath.read(json, "$.rows[2].proposal.price")).isNull();
        assertThat(JsonPath.read(json, "$.warnings").toString()).contains("1 producto no trae precio");
        // Arroz: existe (por el código de barras); conserva su margen 33,3 % con el costo nuevo:
        // 2.400 / 0,667 × 1,19 = 4.281,9 → 4.300.
        assertThat((String) JsonPath.read(json, "$.rows[0].proposal.action")).isEqualTo("UPDATE");
        assertThat((String) JsonPath.read(json, "$.rows[0].match.by")).isEqualTo("BARCODE");
        assertThat(JsonPath.read(json, "$.rows[0].proposal.marginPercent").toString()).isEqualTo("33.3");
        assertThat(JsonPath.read(json, "$.rows[0].proposal.price").toString()).isEqualTo("4300");
        // Frijol: nuevo, con el código del proveedor como SKU y el margen del negocio: 4.000 / 0,7 × 1,05 = 6.000.
        assertThat((String) JsonPath.read(json, "$.rows[1].proposal.action")).isEqualTo("CREATE");
        assertThat((String) JsonPath.read(json, "$.rows[1].proposal.sku")).isEqualTo("FR-500");
        assertThat((String) JsonPath.read(json, "$.rows[1].proposal.taxCode")).isEqualTo("IVA5");
        assertThat((String) JsonPath.read(json, "$.rows[1].proposal.unitCode")).isEqualTo("UND");
        assertThat(JsonPath.read(json, "$.rows[1].proposal.price").toString()).isEqualTo("6000");
        assertThat((Integer) JsonPath.read(json, "$.usage.used")).isEqualTo(1);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(ai).send(sent.capture());
        assertThat(String.valueOf(sent.getValue().get("messages"))).contains("Frijol bola roja 500 g");
        // Nada se guardó todavía.
        api.getWith(s, "/api/v1/products/" + arroz).andExpect(jsonPath("$.salePrice").value(3570));

        // La persona ajusta el precio del frijol y confirma.
        api.postWith(s, "/api/v1/ai/catalog/apply", """
                {"supplierId":"%s","rows":[
                 {"productId":"%s","cost":2400,"price":4300,"supplierCode":"7702511000014"},
                 {"sku":"FR-500","name":"Frijol bola roja 500 g","category":"Granos","unitCode":"UND","taxCode":"IVA5",
                  "cost":4000,"price":6500,"supplierCode":"FR-500"}]}""".formatted(supplier, arroz))
                .andExpect(status().isOk()).andExpect(jsonPath("$.report.applied").value(true))
                .andExpect(jsonPath("$.report.toCreate").value(1)).andExpect(jsonPath("$.report.toUpdate").value(1));
        api.getWith(s, "/api/v1/products/" + arroz).andExpect(jsonPath("$.salePrice").value(4300))
                .andExpect(jsonPath("$.cost").value(2400)).andExpect(jsonPath("$.name").value("Arroz Diana 1 kg"));
        Integer codes = jdbc.queryForObject("SELECT count(*) FROM " + schema(owner)
                + ".supplier_product_codes WHERE supplier_id = ?", Integer.class, supplier);
        assertThat(codes).isEqualTo(2);

        // La segunda vez, el frijol se reconoce por lo aprendido del proveedor.
        json = body(api.uploadNamed(s, "/api/v1/ai/catalog/read", "files", "lista.csv", csv,
                "supplierId", supplier.toString()).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(json, "$.rows[1].match.by")).isEqualTo("MEMORY");
        assertThat((String) JsonPath.read(json, "$.rows[1].proposal.action")).isEqualTo("SKIP");

        // Una lista ilegible no descuenta.
        doReturn(Map.of("stop_reason", "end_turn", "usage", Map.of("input_tokens", 100, "output_tokens", 20),
                "content", List.of(Map.of("type", "text", "text",
                        "{\"readable\":false,\"problem\":\"Es una foto de un perro.\",\"pricesIncludeTax\":false,\"items\":[]}"))))
                .when(ai).send(any());
        api.uploadNamed(s, "/api/v1/ai/catalog/read", "files", "lista.csv", csv).andExpect(status().isUnprocessableEntity());
        api.getWith(s, "/api/v1/ai/catalog/usage").andExpect(jsonPath("$.used").value(2));
    }

    @Test
    void loadsTheNotebookInventoryWithOpeningBalances() throws Exception {
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        Owned owner = api.newTenant("cuaderno");
        Session s = owner.tenant();
        com.poshibrido.sales.PosTestSupport pos = new com.poshibrido.sales.PosTestSupport(api);
        // Gaseosa ya tiene existencias (movimientos): su cantidad no se toca. Arroz existe pero sin movimientos.
        UUID gaseosa = pos.productWithStock(s, "GAS-400", "2500", "7", "1500");
        UUID arroz = pos.productWithStock(s, "ARR-1", "3600", null, null);
        Session admin = platformAdmin();
        api.putWith(admin, "/api/v1/platform/tenants/%s/subscription/extras".formatted(owner.tenantId()),
                "{\"modules\":[],\"features\":[\"AI\"],\"branches\":0,\"registers\":0,\"users\":0}").andExpect(status().isOk());
        s = TestApi.session(api.refreshRaw(s.refreshToken()).andExpect(status().isOk()).andReturn());
        String branch = api.principalBranchId(s).toString();

        doReturn(Map.of("stop_reason", "end_turn", "usage", Map.of("input_tokens", 900, "output_tokens", 300),
                "content", List.of(Map.of("type", "text", "text", """
                {"readable":true,"problem":"","pricesIncludeTax":true,"items":[
                 {"description":"Producto GAS-400","supplierCode":"","barcode":"","unit":"UND","cost":-1,"taxRate":-1,
                  "category":"Bebidas","quantity":10,"price":2500},
                 {"description":"Producto ARR-1","supplierCode":"","barcode":"","unit":"UND","cost":-1,"taxRate":-1,
                  "category":"Granos","quantity":5,"price":3600},
                 {"description":"Panela redonda","supplierCode":"","barcode":"","unit":"UND","cost":-1,"taxRate":-1,
                  "category":"Granos","quantity":12,"price":2000},
                 {"description":"Jabón Rey","supplierCode":"","barcode":"","unit":"UND","cost":1500,"taxRate":-1,
                  "category":"Aseo","quantity":3,"price":-1},
                 {"description":"Ilegible","supplierCode":"","barcode":"","unit":"UND","cost":-1,"taxRate":-1,
                  "category":"","quantity":4,"price":-1}]}""")))).when(ai).send(any());

        // Sin sede no se lee un inventario.
        api.uploadNamed(s, "/api/v1/ai/catalog/read", "files", "hoja.png", png(), "inventory", "true")
                .andExpect(status().isUnprocessableEntity());
        String json = body(api.uploadNamed(s, "/api/v1/ai/catalog/read", "files", "hoja.png", png(),
                "inventory", "true", "branchId", branch, "margin", "30").andExpect(status().isOk()));
        assertThat((Boolean) JsonPath.read(json, "$.inventory")).isTrue();
        assertThat((List<Object>) JsonPath.read(json, "$.rows")).hasSize(5);
        // Decisión 313: solo el nombre, sin precio ni costo: nuevo, con su cantidad y el precio por escribir.
        assertThat((String) JsonPath.read(json, "$.rows[4].proposal.action")).isEqualTo("CREATE");
        assertThat((Object) JsonPath.read(json, "$.rows[4].proposal.price")).isNull();
        assertThat(JsonPath.read(json, "$.rows[4].quantity").toString()).isEqualTo("4.0");
        // Gaseosa: ya tiene movimientos, sin cantidad y con la nota.
        assertThat((Object) JsonPath.read(json, "$.rows[0].quantity")).isNull();
        assertThat((String) JsonPath.read(json, "$.rows[0].stockNote")).contains("conteo");
        // Arroz: existe, mismo precio, sin movimientos: recibe su cantidad.
        assertThat((String) JsonPath.read(json, "$.rows[1].proposal.action")).isEqualTo("SKIP");
        assertThat(JsonPath.read(json, "$.rows[1].quantity").toString()).isEqualTo("5.0");
        // Panela: nueva, solo precio → costo con el margen: 2.000 × 0,7 = 1.400.
        assertThat((String) JsonPath.read(json, "$.rows[2].proposal.action")).isEqualTo("CREATE");
        assertThat(JsonPath.read(json, "$.rows[2].proposal.cost").toString()).isEqualTo("1400.0");
        assertThat(JsonPath.read(json, "$.rows[2].proposal.price").toString()).isEqualTo("2000");
        // Jabón: solo costo → precio con el margen: 1.500 / 0,7 = 2.142,86 → 2.200.
        assertThat(JsonPath.read(json, "$.rows[3].proposal.price").toString()).isEqualTo("2200");

        api.postWith(s, "/api/v1/ai/catalog/apply", """
                {"branchId":"%s","rows":[
                 {"productId":"%s","cost":1500,"price":2500,"quantity":10},
                 {"productId":"%s","cost":0,"price":3600,"quantity":5},
                 {"sku":"PANELA-01","name":"Panela redonda","category":"Granos","unitCode":"UND","taxCode":"EXENTO",
                  "cost":1400,"price":2000,"quantity":12},
                 {"sku":"JABREY-01","name":"Jabón Rey","category":"Aseo","unitCode":"UND","taxCode":"EXENTO",
                  "cost":1500,"price":2200,"quantity":3}]}""".formatted(branch, gaseosa, arroz))
                .andExpect(status().isOk()).andExpect(jsonPath("$.report.applied").value(true))
                .andExpect(jsonPath("$.report.toCreate").value(2)).andExpect(jsonPath("$.stocked").value(3));
        assertThat(pos.stock(s, gaseosa)).isEqualByComparingTo("7");
        assertThat(pos.stock(s, arroz)).isEqualByComparingTo("5");
        UUID panela = UUID.fromString(JsonPath.read(body(api.getWith(s, "/api/v1/products?search=PANELA-01")),
                "$.content[0].id"));
        assertThat(pos.stock(s, panela)).isEqualByComparingTo("12");
    }

    @Test
    void readsTheNotebookPhotosFromAWordInBatchesOfTen() throws Exception {
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        Owned owner = api.newTenant("word");
        Session s = owner.tenant();
        api.putWith(platformAdmin(), "/api/v1/platform/tenants/" + owner.tenantId() + "/subscription/extras",
                "{\"modules\":[],\"features\":[\"AI\"],\"branches\":0,\"registers\":0,\"users\":0}").andExpect(status().isOk());
        s = TestApi.session(api.refreshRaw(s.refreshToken()).andExpect(status().isOk()).andReturn());
        doReturn(Map.of("stop_reason", "end_turn", "usage", Map.of("input_tokens", 900, "output_tokens", 300),
                "content", List.of(Map.of("type", "text", "text", """
                {"readable":true,"problem":"","pricesIncludeTax":true,"items":[
                 {"description":"Jugo Hit Mango 1 L","supplierCode":"","barcode":"","unit":"UND","cost":-1,"taxRate":-1,
                  "category":"Bebidas","quantity":-1,"price":-1}]}""")))).when(ai).send(any());
        byte[] docx = docx(12);
        String json = body(api.uploadNamed(s, "/api/v1/ai/catalog/read", "files", "inventario.docx", docx)
                .andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(json, "$.photos.from")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(json, "$.photos.to")).isEqualTo(10);
        assertThat((Integer) JsonPath.read(json, "$.photos.total")).isEqualTo(12);
        assertThat(JsonPath.read(json, "$.warnings[0]").toString()).contains("trae 12 fotos");
        json = body(api.uploadNamed(s, "/api/v1/ai/catalog/read", "files", "inventario.docx", docx, "fromPhoto", "11")
                .andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(json, "$.photos.to")).isEqualTo(12);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(ai, org.mockito.Mockito.times(2)).send(sent.capture());
        String last = String.valueOf(sent.getAllValues().get(1).get("messages"));
        assertThat(last.split("media_type=image", -1)).hasSize(3);
        api.uploadNamed(s, "/api/v1/ai/catalog/read", "files", "inventario.docx", docx, "fromPhoto", "13")
                .andExpect(status().isUnprocessableEntity());
        // Un precio sin escribir no se guarda.
        api.postWith(s, "/api/v1/ai/catalog/apply", """
                {"rows":[{"sku":"HIT-1L","name":"Jugo Hit Mango 1 L","category":"Bebidas","unitCode":"UND",
                 "taxCode":"IVA19","cost":0}]}""").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("Falta el precio de Jugo Hit")));
    }

    /** Un Word con {@code photos} fotos PNG, en orden. */
    private static byte[] docx(int photos) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(out)) {
            StringBuilder doc = new StringBuilder("<w:document><w:body>");
            StringBuilder rels = new StringBuilder("<Relationships>");
            for (int i = 1; i <= photos; i++) {
                doc.append("<a:blip r:embed=\"rId").append(i).append("\"/>");
                rels.append("<Relationship Id=\"rId").append(i)
                        .append("\" Type=\"image\" Target=\"media/image").append(i).append(".png\"/>");
                zip.putNextEntry(new java.util.zip.ZipEntry("word/media/image" + i + ".png"));
                zip.write(png());
                zip.closeEntry();
            }
            zip.putNextEntry(new java.util.zip.ZipEntry("word/document.xml"));
            zip.write(doc.append("</w:body></w:document>").toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new java.util.zip.ZipEntry("word/_rels/document.xml.rels"));
            zip.write(rels.append("</Relationships>").toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        return out.toByteArray();
    }

    private static byte[] png() throws Exception {
        java.awt.image.BufferedImage img = new java.awt.image.BufferedImage(40, 40, java.awt.image.BufferedImage.TYPE_INT_RGB);
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private String schema(Owned owner) {
        return jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class, owner.tenantId());
    }
}
