package com.poshibrido.purchasing;

import com.poshibrido.catalog.CatalogFixturesAccess;
import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedInvoice;
import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedLine;
import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedSupplier;
import com.poshibrido.purchasing.application.InvoiceReader;
import com.poshibrido.purchasing.application.InvoiceReader.Page;
import com.poshibrido.purchasing.application.InvoiceReader.Result;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Ingresar la mercancía con la foto o el PDF de la factura (decisión 295): la IA (aquí simulada) la lee y sale el mismo
 * borrador que con el XML; las fotos se reducen antes de leerlas; la lectura cuenta en el tope del mes solo si se pudo
 * leer; solo con el adicional XASKA IA; con el tope lleno se avisa, y los extras de la consola dan más.
 */
class InvoiceScanIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(java.time.ZoneId.of("America/Bogota"));

    @MockitoBean
    private InvoiceReader reader;

    @Test
    void readsPhotosCountsOnlyWhatWasReadAndRespectsTheMonthlyLimit() throws Exception {
        when(reader.available()).thenReturn(true);
        Owned owner = api.newTenant("factura-foto");
        Session s = owner.tenant();
        api.postWith(s, "/api/v1/products", CatalogFixturesAccess.simpleProduct("ACE500", "Acetaminofén 500 mg caja",
                "5000", "7702001001001")).andExpect(status().isCreated());

        // Ningún plan trae XASKA IA: sin el adicional no hay botón ni lectura (el XML sigue para todos).
        api.getWith(s, "/api/v1/purchases/documents/scan-usage").andExpect(status().isForbidden());
        scan(s, photo(600, 600)).andExpect(status().isForbidden());
        Session admin = platformAdmin();
        api.putWith(admin, "/api/v1/platform/plans/EMPRESA", """
                {"name":"Empresa","active":true,"features":["PURCHASES","AI"]}""").andExpect(status().is(422));
        api.getWith(admin, "/api/v1/platform/ai-allowances").andExpect(jsonPath("$[0].code").value("INVOICE_SCANS"))
                .andExpect(jsonPath("$[0].monthlyLimit").value(100));
        String extras = "/api/v1/platform/tenants/%s/subscription/extras".formatted(owner.tenantId());
        api.putWith(admin, extras, "{\"modules\":[],\"features\":[\"AI\"],\"branches\":0,\"registers\":0,\"users\":0}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.entitled.maxInvoiceScans").value(100));
        s = renew(s);
        api.getWith(s, "/api/v1/purchases/documents/scan-usage").andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.limit").value(100)).andExpect(jsonPath("$.used").value(0));

        // Una foto grande: se lee reducida (máximo 1.600 px) y sale el borrador emparejado, con el aviso de revisar.
        when(reader.read(any())).thenReturn(readInvoice());
        String draft = body(scan(s, photo(3000, 2000)).andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("IMAGE"))
                .andExpect(jsonPath("$.invoiceNumber").value("FV-77"))
                .andExpect(jsonPath("$.lines[0].match.by").value("BARCODE"))
                .andExpect(jsonPath("$.lines[1].match").doesNotExist())
                .andExpect(jsonPath("$.warnings[0]", containsString("Leída con IA"))));
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Page>> pages = ArgumentCaptor.forClass(List.class);
        verify(reader, atLeastOnce()).read(pages.capture());
        BufferedImage sent = ImageIO.read(new ByteArrayInputStream(pages.getValue().getFirst().content()));
        assertThat(Math.max(sent.getWidth(), sent.getHeight())).isEqualTo(1600);
        assertThat(pages.getValue().getFirst().mediaType()).isEqualTo("image/jpeg");
        String documentId = com.jayway.jsonpath.JsonPath.read(draft, "$.documentId");
        api.getWith(s, "/api/v1/purchases/documents/%s/file".formatted(documentId))
                .andExpect(status().isOk()).andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"));

        // Dos fotos de la misma factura: una sola lectura, guardadas juntas en un ZIP.
        String two = body(scan(s, photo(800, 1200), photo(800, 1200)).andExpect(status().isOk()));
        api.getWith(s, "/api/v1/purchases/documents/%s/file".formatted((String) com.jayway.jsonpath.JsonPath.read(two, "$.documentId")))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "application/zip"));
        api.getWith(s, "/api/v1/purchases/documents/scan-usage").andExpect(jsonPath("$.used").value(2));

        // No se pudo leer o el servicio no respondió: no cuenta.
        when(reader.read(any())).thenReturn(new Result(null, "La foto está borrosa.", "claude-haiku-5-5", 900, 20));
        scan(s, photo(600, 600)).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("borrosa")))
                .andExpect(jsonPath("$.detail", containsString("No se descontó")));
        when(reader.read(any())).thenThrow(new InvoiceReader.ReaderUnavailableException("sin red", null));
        scan(s, photo(600, 600)).andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("no respondió")));
        api.getWith(s, "/api/v1/purchases/documents/scan-usage").andExpect(jsonPath("$.used").value(2));

        // Archivos que no son fotos ni PDF, o demasiadas fotos.
        scan(s, "hola".getBytes()).andExpect(status().is(422));
        scan(s, photo(10, 10), photo(10, 10), photo(10, 10), photo(10, 10), photo(10, 10), photo(10, 10))
                .andExpect(status().is(422));

        // Tope de la consola en 40 y el mes lleno: se avisa; con 5 de más para este negocio, vuelve a leer.
        api.putWith(admin, "/api/v1/platform/ai-allowances/INVOICE_SCANS", "{\"monthlyLimit\":40}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.monthlyLimit").value(40));
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        for (int i = 0; i < 38; i++) {
            jdbc.update(("INSERT INTO %s.purchase_invoice_scans (id, status, pages, created_by, created_at) "
                    + "VALUES (?, 'OK', 1, ?, now())").formatted(schema), UUID.randomUUID(), UUID.randomUUID());
        }
        try {
            doReturn(readInvoice()).when(reader).read(any());
            scan(s, photo(600, 600)).andExpect(status().is(422))
                    .andExpect(jsonPath("$.detail", containsString("Llegaste a las 40 lecturas")));
            api.putWith(admin, extras, "{\"modules\":[],\"features\":[\"AI\"],\"branches\":0,\"registers\":0,"
                    + "\"users\":0,\"invoiceScans\":5}")
                    .andExpect(status().isOk()).andExpect(jsonPath("$.entitled.maxInvoiceScans").value(45))
                    .andExpect(jsonPath("$.usage.invoiceScans").value(40));
            scan(s, photo(600, 600)).andExpect(status().isOk());
            api.getWith(s, "/api/v1/purchases/documents/scan-usage").andExpect(jsonPath("$.limit").value(45))
                    .andExpect(jsonPath("$.used").value(41));
        } finally {
            api.putWith(admin, "/api/v1/platform/ai-allowances/INVOICE_SCANS", "{\"monthlyLimit\":100}")
                    .andExpect(status().isOk());
        }
    }

    private Session renew(Session session) throws Exception {
        return com.poshibrido.support.TestApi.session(api.refreshRaw(session.refreshToken())
                .andExpect(status().isOk()).andReturn());
    }

    private static Result readInvoice() {
        ParsedInvoice invoice = new ParsedInvoice(new ParsedSupplier("900123456", 8, "Distribuidora de Prueba S.A.S."),
                "FV-77", TODAY, null, "PAID", null, new BigDecimal("6400.00"), null, new BigDecimal("6400.00"),
                BigDecimal.ZERO, false, List.of(
                new ParsedLine(1, "ACETAMINOFEN 500 MG X 10", "A-1", "7702001001001", "UND", false, new BigDecimal("2"),
                        new BigDecimal("3200.00"), BigDecimal.ZERO, BigDecimal.ZERO, "AB12", TODAY.plusYears(2)),
                new ParsedLine(2, "PRODUCTO QUE NO EXISTE", "Z-9", null, "UND", false, BigDecimal.ONE,
                        new BigDecimal("100.00"), BigDecimal.ZERO, BigDecimal.ZERO, null, null)));
        return new Result(invoice, null, "claude-haiku-5-5", 1500, 300);
    }

    private ResultActions scan(Session s, byte[]... files) throws Exception {
        var request = multipart("/api/v1/purchases/documents/scan").header(HttpHeaders.AUTHORIZATION, s.bearer());
        for (int i = 0; i < files.length; i++) {
            request.file(new MockMultipartFile("files", "foto-" + i + ".jpg", "image/jpeg", files[i]));
        }
        return mvc.perform(request);
    }

    private static byte[] photo(int w, int h) throws Exception {
        BufferedImage image = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        var g = image.createGraphics();
        g.setColor(java.awt.Color.WHITE);
        g.fillRect(0, 0, w, h);
        g.setColor(java.awt.Color.BLACK);
        g.drawString("FACTURA FV-77", 10, 20);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "jpeg", out);
        return out.toByteArray();
    }

    private static String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }
}
