package com.poshibrido.purchasing;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * "Qué comprar" (decisión 297): el pedido sugerido sale de lo vendido, la existencia, el mínimo y el máximo, agrupado
 * por el proveedor de la última compra y con sus días; la revisión con IA (simulada) solo con XASKA IA y solo con
 * ajustes de productos del pedido.
 */
class PurchaseSuggestionIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Bogota"));

    @MockitoBean
    private AnthropicMessages ai;

    @Test
    @SuppressWarnings("unchecked")
    void suggestsByFormulaGroupsBySupplierAndReviewsWithAi() throws Exception {
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("que-comprar");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        UUID cafe = pos.productWithStock(s, "CAFE", "10000", null, null);
        UUID azucar = pos.productWithStock(s, "AZUC", "4000", "50", "2000");
        UUID supplier = id(api.postWith(s, "/api/v1/suppliers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"%d","firstNames":"Café","lastNames":"Andino",
                 "phone":"3001234567"}""".formatted(20_000_000 + (System.nanoTime() % 70_000_000)))
                .andExpect(status().isCreated()), "$.id");
        pos.openCash(s, CAJA_1, "200000");
        api.postWith(s, "/api/v1/purchases", """
                {"branchId":"%s","supplierId":"%s","supplierInvoice":"FV-1","invoiceDate":"%s","paymentType":"PAID",
                 "paymentMethodId":"%s","checksConfirmed":true,"lines":[{"productId":"%s","quantity":20,"unitCost":6000,
                 "taxRate":0,"status":"ACCEPTED"}]}""".formatted(branch, supplier, TODAY, CASH, cafe))
                .andExpect(status().isCreated());
        pos.sellCash(s, cafe, "14", "140000").andExpect(status().isCreated());
        pos.sellCash(s, azucar, "1", "4000").andExpect(status().isCreated());
        api.putWith(s, "/api/v1/inventory/stock-levels", """
                {"branchId":"%s","productId":"%s","minStock":5,"maxStock":40}""".formatted(branch, cafe))
                .andExpect(status().isOk());

        // Café: vendió 14 en la semana → diaria 0,6×14/7 + 0,4×14/30 = 1,387; 15 días + mínimo 5 − existencia 6 = 19,8
        // → 20 (el máximo 40 no limita). Azúcar: 1 vendida, 49 en bodega: no hay que pedir.
        String json = body(api.getWith(s, "/api/v1/purchases/suggestions?branchId=" + branch).andExpect(status().isOk()));
        assertThat((List<Object>) JsonPath.read(json, "$.groups")).hasSize(1);
        assertThat((String) JsonPath.read(json, "$.groups[0].supplierName")).isEqualTo("Café Andino");
        assertThat((Integer) JsonPath.read(json, "$.groups[0].coverageDays")).isEqualTo(15);
        assertThat(JsonPath.read(json, "$.groups[0].lines[0].suggested").toString()).isEqualTo("20");
        assertThat(JsonPath.read(json, "$.groups[0].lines[0].estimatedTotal").toString()).isEqualTo("120000");

        // Proveedor que viene cada semana: 7 días → 1,387×7 + 5 − 6 = 8,7 → 9.
        api.putWith(s, "/api/v1/purchases/suggestions/suppliers/" + supplier, "{\"days\":7}").andExpect(status().isOk());
        api.putWith(s, "/api/v1/purchases/suggestions/suppliers/" + supplier, "{\"days\":0}").andExpect(status().isBadRequest());
        json = body(api.getWith(s, "/api/v1/purchases/suggestions?branchId=" + branch));
        assertThat(JsonPath.read(json, "$.groups[0].lines[0].suggested").toString()).isEqualTo("9");

        // Revisión con IA: solo con XASKA IA.
        String review = """
                {"branchId":"%s","supplierId":"%s","lines":[{"productId":"%s","quantity":9}]}"""
                .formatted(branch, supplier, cafe);
        api.postWith(s, "/api/v1/purchases/suggestions/review", review).andExpect(status().isForbidden());
        Session admin = platformAdmin();
        api.putWith(admin, "/api/v1/platform/tenants/%s/subscription/extras".formatted(owner.tenantId()),
                "{\"modules\":[],\"features\":[\"AI\"],\"branches\":0,\"registers\":0,\"users\":0}").andExpect(status().isOk());
        s = TestApi.session(api.refreshRaw(s.refreshToken()).andExpect(status().isOk()).andReturn());
        api.getWith(s, "/api/v1/purchases/suggestions/review-usage").andExpect(jsonPath("$.limit").value(60));
        String answer = "{\"summary\":\"La semana fue fuerte: pide un poco más de café.\",\"adjustments\":["
                + "{\"productId\":\"" + cafe + "\",\"quantity\":12.4,\"reason\":\"Vendió más esta semana.\"},"
                + "{\"productId\":\"" + UUID.randomUUID() + "\",\"quantity\":3,\"reason\":\"Inventado\"}]}";
        doReturn(Map.of("stop_reason", "end_turn", "usage", Map.of("input_tokens", 700, "output_tokens", 80),
                "content", List.of(Map.of("type", "text", "text", answer)))).when(ai).send(any());
        api.postWith(s, "/api/v1/purchases/suggestions/review", review).andExpect(status().isOk())
                .andExpect(jsonPath("$.summary", containsString("café")))
                .andExpect(jsonPath("$.adjustments.length()").value(1))
                .andExpect(jsonPath("$.adjustments[0].quantity").value(12))
                .andExpect(jsonPath("$.usage.used").value(1));
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(ai).send(sent.capture());
        assertThat(String.valueOf(sent.getValue().get("messages"))).contains("vendido7dias").contains("Café Andino");
        assertThat(String.valueOf(sent.getValue().get("output_config"))).contains("json_schema");
        // Las preguntas y las revisiones tienen topes separados.
        api.getWith(s, "/api/v1/ai/usage").andExpect(jsonPath("$.used").value(0));
    }
}
