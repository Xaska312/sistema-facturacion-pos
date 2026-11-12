package com.poshibrido.ai;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.ai.application.AskaRecapService;
import com.poshibrido.ai.application.DailyDigestService;
import com.poshibrido.mail.MailTemplates;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import com.poshibrido.tenancy.application.TenantRef;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.TRANSFER;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Aska y las finanzas (decisión 325): leer el recibo de un gasto con foto (con su tope y sin descontar si no se lee),
 * las consultas de gastos, estado de resultados, tablero y retenciones, los gastos en el Resumen del día y cómo le
 * fue al negocio en el correo del mes.
 */
class FinanceAskaIT extends IntegrationTest {

    private static final String UTILITIES = "01920000-0000-7000-8000-000000000a02";

    @MockitoBean
    private AnthropicMessages ai;
    @Autowired
    private AskaRecapService recaps;
    @Autowired
    private MailTemplates templates;
    @Autowired
    private DailyDigestService digests;

    private static Map<String, Object> usage() {
        return Map.of("input_tokens", 900, "output_tokens", 80);
    }

    private void answer(String json) {
        reset(ai);
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        doReturn(Map.of("stop_reason", "end_turn", "usage", usage(),
                "content", List.of(Map.of("type", "text", "text", json)))).when(ai).send(any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void readsReceiptsAnswersMoneyQuestionsAndTellsTheDayAndTheMonth() throws Exception {
        answer("{}");
        Owned owner = api.newTenant("aska-finanzas");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        String nit = String.valueOf(800_000_000 + (System.nanoTime() % 99_000_000));
        UUID supplier = id(api.postWith(s, "/api/v1/suppliers", """
                {"personType":"LEGAL","documentType":"NIT","documentNumber":"%s","verificationDigit":%d,
                 "businessName":"Enertolima S.A. E.S.P."}""".formatted(nit,
                com.poshibrido.parties.domain.Nit.verificationDigit(nit))).andExpect(status().isCreated()), "$.id");
        byte[] photo = photo();

        // --- Leer el recibo: solo con XASKA IA.
        api.uploadNamed(s, "/api/v1/ai/expenses/read", "file", "recibo.jpg", photo).andExpect(status().isForbidden());
        Session admin = platformAdmin();
        api.putWith(admin, "/api/v1/platform/tenants/%s/subscription/extras".formatted(owner.tenantId()),
                "{\"modules\":[],\"features\":[\"AI\"],\"branches\":0,\"registers\":0,\"users\":0}")
                .andExpect(status().isOk());
        s = renew(s);
        api.getWith(s, "/api/v1/ai/expenses/usage").andExpect(jsonPath("$.limit").value(100))
                .andExpect(jsonPath("$.used").value(0));

        LocalDate today = LocalDate.now(ZoneId.of("America/Bogota"));
        answer("""
                {"readable":true,"problem":"","amount":45230.4,"date":"%s","category":"servicios publicos",
                 "supplierName":"Enertolima","supplierDocument":"%s-%d","reference":"FE-9981",
                 "note":"Energía de octubre"}""".formatted(today.minusDays(2), nit,
                com.poshibrido.parties.domain.Nit.verificationDigit(nit)));
        api.uploadNamed(s, "/api/v1/ai/expenses/read", "file", "recibo.jpg", photo).andExpect(status().isOk())
                .andExpect(jsonPath("$.amount").value(45230))
                .andExpect(jsonPath("$.date").value(today.minusDays(2).toString()))
                .andExpect(jsonPath("$.categoryId").value(UTILITIES))
                .andExpect(jsonPath("$.categoryName").value("Servicios públicos"))
                .andExpect(jsonPath("$.supplierId").value(supplier.toString()))
                .andExpect(jsonPath("$.reference").value("FE-9981"))
                .andExpect(jsonPath("$.note").value("Energía de octubre"))
                .andExpect(jsonPath("$.usage.used").value(1));
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(ai).send(sent.capture());
        assertThat(String.valueOf(sent.getValue().get("messages"))).contains("image").contains("Servicios públicos")
                .contains("Arriendo");
        assertThat(String.valueOf(sent.getValue().get("output_config"))).contains("json_schema");

        // Fecha futura (la fecha límite, no la del pago) y proveedor que no existe: se avisa y no se inventa.
        answer("""
                {"readable":true,"problem":"","amount":-1,"date":"%s","category":"Gasolina",
                 "supplierName":"Taller El Pistón","supplierDocument":"","reference":"","note":""}"""
                .formatted(today.plusDays(10)));
        String json = body(api.uploadNamed(s, "/api/v1/ai/expenses/read", "file", "recibo.jpg", photo)
                .andExpect(status().isOk()));
        assertThat((Object) JsonPath.read(json, "$.amount")).isNull();
        assertThat((Object) JsonPath.read(json, "$.date")).isNull();
        assertThat((Object) JsonPath.read(json, "$.categoryId")).isNull();
        assertThat((Object) JsonPath.read(json, "$.supplierId")).isNull();
        assertThat(JsonPath.read(json, "$.warnings").toString()).contains("No vi el valor").contains("es futura")
                .contains("Elige la categoría").contains("Taller El Pistón");

        // No es un recibo: no se descuenta.
        answer("{\"readable\":false,\"problem\":\"La foto es de un gato.\",\"amount\":-1,\"date\":\"\",\"category\":\"\","
                + "\"supplierName\":\"\",\"supplierDocument\":\"\",\"reference\":\"\",\"note\":\"\"}");
        api.uploadNamed(s, "/api/v1/ai/expenses/read", "file", "recibo.jpg", photo).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("La foto es de un gato. No se descontó.")));
        api.uploadNamed(s, "/api/v1/ai/expenses/read", "file", "nota.txt", "hola".getBytes())
                .andExpect(status().is(422));
        api.getWith(s, "/api/v1/ai/expenses/usage").andExpect(jsonPath("$.used").value(2));
        // El cajero no lee recibos si no puede registrar gastos (sin XASKA IA en su sesión tampoco).
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        api.getWith(cashier, "/api/v1/ai/expenses/usage").andExpect(status().isOk());

        // --- Un gasto de hoy por transferencia.
        api.postWith(s, "/api/v1/expenses", """
                {"amount":50000,"categoryId":"%s","paymentMethodId":"%s","branchId":"%s","note":"Luz"}"""
                .formatted(UTILITIES, TRANSFER, branch)).andExpect(status().isCreated());

        // --- Pregúntale a tu negocio: las cuatro consultas de finanzas.
        reset(ai);
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        doReturn(Map.of("stop_reason", "tool_use", "usage", usage(), "content", List.of(
                        Map.of("type", "tool_use", "id", "g", "name", "gastos", "input", Map.of()),
                        Map.of("type", "tool_use", "id", "e", "name", "estado_resultados", "input", Map.of()),
                        Map.of("type", "tool_use", "id", "t", "name", "tablero_finanzas", "input", Map.of()),
                        Map.of("type", "tool_use", "id", "r", "name", "retenciones", "input", Map.of()))),
                Map.of("stop_reason", "end_turn", "usage", usage(), "content", List.of(
                        Map.of("type", "text", "text", "Este mes llevas $50.000 en gastos."))))
                .when(ai).send(any());
        api.postWith(s, "/api/v1/ai/ask", "{\"question\":\"¿Cuánto he gastado y cuánto gané este mes?\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.consulted").value(org.hamcrest.Matchers.containsInAnyOrder("Gastos",
                        "Estado de resultados", "Tablero de finanzas y punto de equilibrio", "Retenciones")));
        ArgumentCaptor<Map<String, Object>> asked = ArgumentCaptor.forClass(Map.class);
        verify(ai, atLeastOnce()).send(asked.capture());
        assertThat(String.valueOf(asked.getAllValues().getFirst().get("tools"))).contains("estado_resultados")
                .contains("tablero_finanzas");
        assertThat(String.valueOf(asked.getAllValues().getFirst().get("system"))).contains("utilidad operativa");
        String results = String.valueOf(asked.getAllValues().get(1).get("messages"));
        assertThat(results).contains("Servicios públicos").contains("operatingProfit").contains("breakEven")
                .contains("pendingCertificates").doesNotContain("is_error=true");
        // Quien no ve finanzas no recibe esas consultas.
        reset(ai);
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        doReturn(Map.of("stop_reason", "end_turn", "usage", usage(), "content", List.of(
                Map.of("type", "text", "text", "Hola.")))).when(ai).send(any());
        api.postWith(cashier, "/api/v1/ai/ask", "{\"question\":\"¿Cuánto gané?\"}").andExpect(status().isOk());
        ArgumentCaptor<Map<String, Object>> cashierAsked = ArgumentCaptor.forClass(Map.class);
        verify(ai).send(cashierAsked.capture());
        assertThat(String.valueOf(cashierAsked.getValue().get("tools"))).doesNotContain("estado_resultados")
                .doesNotContain("\"gastos\"").doesNotContain("name=gastos");

        // --- El Resumen del día trae los gastos, la ganancia del día y los fijos por vencer.
        answer("""
                {"headline":"Hoy pagaste la luz.","points":[
                 {"section":"FINANCE","tone":"warning","title":"Gastos del día","detail":"Pagaste $50.000 de luz."},
                 {"section":"SALES","tone":"info","title":"Sin ventas","detail":"Hoy no hubo ventas."}],
                 "figures":[{"label":"Ventas","value":"$0"},{"label":"Gastos","value":"$50.000"}],
                 "forecast":"","followUps":["¿Cuánto gasté este mes?","¿Cuál es mi punto de equilibrio?"]}""");
        api.postWith(s, "/api/v1/ai/digest/run", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.points[0].section").value("FINANCE"));
        ArgumentCaptor<Map<String, Object>> digest = ArgumentCaptor.forClass(Map.class);
        verify(ai).send(digest.capture());
        assertThat(String.valueOf(digest.getValue().get("messages"))).contains("gastos").contains("gananciaDelDia")
                .contains("fijosVencidos").contains("fijosVencenHoyOMañana");
        // Antes del mediodía el resumen es del día anterior: los datos del día se prueban con la fecha del gasto.
        assertThat(String.valueOf(digest.getValue().get("system"))).contains("FINANCE");
        // El cajero no ve los gastos del día.
        api.getWith(cashier, "/api/v1/ai/digest/latest").andExpect(status().is2xxSuccessful());

        // --- El correo del mes: cómo le fue al negocio.
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        try {
            TenantContext.set(new TenantRef(owner.tenantId(), owner.slug(), schema));
            // Los gastos del Resumen del día, con la fecha del gasto (el resumen de la mañana es del día anterior).
            Map<String, Object> facts = digests.expenseFacts(today);
            assertThat(new java.math.BigDecimal(String.valueOf(facts.get("totalHoy")))).isEqualByComparingTo("50000");
            assertThat(new java.math.BigDecimal(String.valueOf(facts.get("gananciaDelDia"))))
                    .isEqualByComparingTo("-50000");
            assertThat(String.valueOf(facts.get("porCategoria"))).contains("Servicios públicos");
            AskaRecapService.Recap recap = recaps.month(YearMonth.now(ZoneId.of("America/Bogota")));
            assertThat(recap.receipts()).isEqualTo(2);
            assertThat(AskaRecapService.lines(recap)).extracting(l -> l[1])
                    .contains("Leí 2 recibos de tus gastos y llené el formulario por ti.");
            MailTemplates.RecapMoney money = recaps.money(YearMonth.now(ZoneId.of("America/Bogota")));
            assertThat(money).isNotNull();
            assertThat(money.label()).isEqualTo("Perdiste");
            assertThat(money.profit()).isEqualTo("$50.000");
            assertThat(money.topExpenses().getFirst()).containsExactly("Servicios públicos", "$50.000");
            var mail = templates.askaRecap("dueno@example.com", "Dani Mejía", "Tienda", "Tu octubre con Aska", null,
                    List.of(), null, money);
            assertThat(mail.html()).contains("Así le fue a tu negocio").contains("Perdiste")
                    .contains("/app/estado-de-resultados?periodo=mes-pasado").doesNotContain("pocos días para probarme");
            assertThat(mail.text()).contains("Tus gastos más grandes: Servicios públicos $50.000");
            assertThat(recaps.money(YearMonth.now(ZoneId.of("America/Bogota")).minusMonths(3))).isNull();
        } finally {
            TenantContext.clear();
        }
    }

    private Session renew(Session session) throws Exception {
        return TestApi.session(api.refreshRaw(session.refreshToken()).andExpect(status().isOk()).andReturn());
    }

    private static byte[] photo() throws Exception {
        BufferedImage image = new BufferedImage(400, 600, BufferedImage.TYPE_INT_RGB);
        var g = image.createGraphics();
        g.setColor(java.awt.Color.WHITE);
        g.fillRect(0, 0, 400, 600);
        g.setColor(java.awt.Color.BLACK);
        g.drawString("ENERTOLIMA $45.230", 10, 20);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "jpeg", out);
        return out.toByteArray();
    }
}
