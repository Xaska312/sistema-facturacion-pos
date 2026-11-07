package com.poshibrido.billing;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static com.poshibrido.sales.PosTestSupport.body;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Planes y pagos con Bre-B (decisión 302): el pedido se calcula en el servidor, el comprobante lo revisa Aska (simulada)
 * y al aprobar se renueva el plan y se suman los adicionales; la prueba gratis de XASKA IA es una sola vez.
 */
class BillingIT extends IntegrationTest {

    @MockitoBean
    private AnthropicMessages ai;

    @Test
    void orderPayWithBrebProofAndApprove() throws Exception {
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        Owned owner = api.newTenant("paga-breb");
        Session s = owner.tenant();
        Session admin = platformAdmin();
        // Sin llave Bre-B configurada no se arman pedidos (la base es compartida entre pruebas: se deja vacía).
        api.putWith(admin, "/api/v1/platform/billing/breb", "{\"key\":\"\",\"holderName\":\"\"}").andExpect(status().isOk());
        String catalog = body(api.getWith(s, "/api/v1/billing").andExpect(status().isOk()));
        assertThat((List<String>) JsonPath.read(catalog, "$.plans[*].code")).containsExactly("EMPRENDE", "NEGOCIO", "EMPRESA");
        assertThat(JsonPath.read(catalog, "$.addons[?(@.code == 'AI')].monthlyPrice").toString()).contains("39900");
        assertThat((Boolean) JsonPath.read(catalog, "$.breb.ready")).isFalse();
        String order = """
                {"planCode":"NEGOCIO","billingCycle":"MONTHLY","periods":2,
                 "addons":[{"code":"AI","quantity":1},{"code":"EXTRA_USER","quantity":2}]}""";
        api.postWith(s, "/api/v1/billing/requests", order).andExpect(status().isUnprocessableEntity());

        api.putWith(admin, "/api/v1/platform/billing/breb",
                "{\"key\":\"@XASKAPOS\",\"holderName\":\"Daniel Mejía\",\"bankName\":\"Bancolombia\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.ready").value(true));
        // Lo que ya trae el plan no se vende aparte.
        api.postWith(s, "/api/v1/billing/requests", """
                {"planCode":"NEGOCIO","billingCycle":"MONTHLY","periods":1,"addons":[{"code":"TABLES","quantity":1}]}""")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").value("Mesas ya viene en tu plan."));
        // 69.900 × 2 + 39.900 × 2 + 4.900 × 2 usuarios × 2 meses = 239.200.
        String req = body(api.postWith(s, "/api/v1/billing/requests", order).andExpect(status().isOk()));
        String id = JsonPath.read(req, "$.id");
        String reference = JsonPath.read(req, "$.reference");
        assertThat(new java.math.BigDecimal(JsonPath.read(req, "$.amount").toString())).isEqualByComparingTo("239200");
        assertThat(reference).matches("XK[A-Z0-9]{6}");

        String today = LocalDate.now(ZoneId.of("America/Bogota")).toString();
        doReturn(Map.of("stop_reason", "end_turn", "content", List.of(Map.of("type", "text", "text", """
                {"readable":true,"amount":239200,"reference":"Pago %s","date":"%s","destination":"@xaskapos",
                 "successful":true}""".formatted(reference, today))))).when(ai).send(any());
        api.uploadNamed(s, "/api/v1/billing/requests/" + id + "/proof", "file", "comprobante.png", png())
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SENT"))
                .andExpect(jsonPath("$.check.amountOk").value(true))
                .andExpect(jsonPath("$.check.referenceOk").value(true))
                .andExpect(jsonPath("$.check.destinationOk").value(true))
                .andExpect(jsonPath("$.check.note").value("Todo cuadra con el pedido."));

        api.getWith(admin, "/api/v1/platform/billing/pending").andExpect(jsonPath("$.count").value(1));
        api.getWith(admin, "/api/v1/platform/billing/requests/" + id + "/proof").andExpect(status().isOk())
                .andExpect(content().contentType("image/jpeg"));
        api.postEmpty(admin, "/api/v1/platform/billing/requests/" + id + "/approve").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
        api.postEmpty(admin, "/api/v1/platform/billing/requests/" + id + "/approve").andExpect(status().isUnprocessableEntity());

        String sub = body(api.getWith(s, "/api/v1/subscription").andExpect(status().isOk()));
        assertThat((String) JsonPath.read(sub, "$.plan.code")).isEqualTo("NEGOCIO");
        assertThat((Boolean) JsonPath.read(sub, "$.trial")).isFalse();
        assertThat((List<String>) JsonPath.read(sub, "$.entitled.features")).contains("AI");
        assertThat((Integer) JsonPath.read(sub, "$.entitled.maxUsers")).isEqualTo(8);
        assertThat((Boolean) JsonPath.read(sub, "$.aiTrialAvailable")).isFalse();
        assertThat(mailbox.last(owner.email(), "suscripcion-pagada")).isPresent();
    }

    @Test
    void aiTrialOnceWithTrialLimitsAndRejectedProof() throws Exception {
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        Owned owner = api.newTenant("prueba-ia");
        Session s = owner.tenant();
        api.getWith(s, "/api/v1/ai/teaser").andExpect(status().isOk()).andExpect(jsonPath("$.canBuy").value(true));
        api.getWith(s, "/api/v1/subscription").andExpect(jsonPath("$.aiTrialAvailable").value(true));
        api.postEmpty(s, "/api/v1/billing/ai-trial").andExpect(status().isOk())
                .andExpect(jsonPath("$.aiTrialAvailable").value(false))
                .andExpect(jsonPath("$.addons[0].code").value("AI"))
                .andExpect(jsonPath("$.addons[0].trial").value(true));
        api.postEmpty(s, "/api/v1/billing/ai-trial").andExpect(status().isUnprocessableEntity());
        s = TestApi.session(api.refreshRaw(s.refreshToken()).andExpect(status().isOk()).andReturn());
        // Con la prueba, los topes son los de prueba.
        api.getWith(s, "/api/v1/ai/usage").andExpect(jsonPath("$.limit").value(40));
        api.getWith(s, "/api/v1/ai/teaser").andExpect(jsonPath("$.show").value(false));

        Session admin = platformAdmin();
        api.putWith(admin, "/api/v1/platform/billing/breb",
                "{\"key\":\"@XASKAPOS\",\"holderName\":\"Daniel Mejía\",\"bankName\":\"Bancolombia\"}").andExpect(status().isOk());
        String req = body(api.postWith(s, "/api/v1/billing/requests",
                "{\"billingCycle\":\"MONTHLY\",\"periods\":1,\"addons\":[{\"code\":\"AI\",\"quantity\":1}]}")
                .andExpect(status().isOk()));
        String id = JsonPath.read(req, "$.id");
        doReturn(Map.of("stop_reason", "end_turn", "content", List.of(Map.of("type", "text", "text", """
                {"readable":true,"amount":10000,"reference":"","date":"2020-01-01","destination":"Otra persona",
                 "successful":true}""")))).when(ai).send(any());
        api.uploadNamed(s, "/api/v1/billing/requests/" + id + "/proof", "file", "c.png", png())
                .andExpect(jsonPath("$.check.amountOk").value(false))
                .andExpect(jsonPath("$.check.referenceOk").value(false))
                .andExpect(jsonPath("$.check.destinationOk").value(false));
        api.postWith(admin, "/api/v1/platform/billing/requests/" + id + "/reject", "{\"reason\":\"El valor no coincide.\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
        assertThat(mailbox.last(owner.email(), "pago-rechazado")).isPresent();
    }

    @Test
    void publicPricingQrAndPayNowToStart() throws Exception {
        // Sin iniciar sesión: planes y adicionales con precio.
        String pricing = body(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get("/api/v1/public/pricing")).andExpect(status().isOk()));
        assertThat((List<String>) JsonPath.read(pricing, "$.plans[*].code")).contains("NEGOCIO");
        assertThat((Integer) JsonPath.read(pricing, "$.trialDays")).isEqualTo(14);

        Session admin = platformAdmin();
        api.putWith(admin, "/api/v1/platform/billing/breb",
                "{\"key\":\"@UMH986\",\"holderName\":\"Daniel Mejía\",\"bankName\":\"Nu\"}").andExpect(status().isOk());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/v1/platform/billing/breb/qr")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "qr.png", "image/png", png()))
                        .with(r -> { r.setMethod("PUT"); return r; })
                        .header("Authorization", admin.bearer()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasQr").value(true));
        api.uploadNamed(admin, "/api/v1/platform/billing/breb/qr", "file", "x.txt", "hola".getBytes())
                .andExpect(status().is4xxClientError());

        // Quien ya usó su prueba puede crear otro negocio para pagarlo ya: nace vencido, solo con Planes y pagos.
        Owned owner = api.newTenant("paga-ya");
        String slug = TestApi.uniqueSlug("pagaya");
        String created = body(api.createTenantPayNow(owner.platform(), slug).andExpect(status().isCreated()));
        java.util.UUID tenantId = java.util.UUID.fromString(JsonPath.read(created, "$.id"));
        Session s = api.selectTenant(owner.platform(), tenantId);
        api.getWith(s, "/api/v1/subscription").andExpect(jsonPath("$.status").value("EXPIRED"));
        api.getWith(s, "/api/v1/billing").andExpect(status().isOk()).andExpect(jsonPath("$.breb.hasQr").value(true));
        api.getWith(s, "/api/v1/billing/qr").andExpect(status().isOk()).andExpect(content().contentType("image/png"));
        api.postWith(s, "/api/v1/billing/requests", "{\"planCode\":\"EMPRENDE\",\"billingCycle\":\"MONTHLY\",\"periods\":1}")
                .andExpect(status().isOk());
        // Lo demás queda en solo lectura hasta que se apruebe el pago.
        api.postWith(s, "/api/v1/billing/ai-trial", "{}").andExpect(status().isOk());
        api.postWith(s, "/api/v1/products", "{}").andExpect(status().is4xxClientError());
    }

    private static byte[] png() throws Exception {
        BufferedImage img = new BufferedImage(40, 40, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }
}
