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
        assertThat((List<Object>) JsonPath.read(json, "$.rows")).hasSize(2);
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
                .andExpect(status().isOk()).andExpect(jsonPath("$.applied").value(true))
                .andExpect(jsonPath("$.toCreate").value(1)).andExpect(jsonPath("$.toUpdate").value(1));
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

    private String schema(Owned owner) {
        return jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class, owner.tenantId());
    }
}
