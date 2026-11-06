package com.poshibrido.purchasing.application;

import com.poshibrido.purchasing.application.InvoiceReader.Page;
import com.poshibrido.purchasing.application.InvoiceReader.Result;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Lector de facturas con Claude (decisión 295): la petición, la respuesta y lo que se toma de ella. */
class AnthropicInvoiceReaderTest {

    private static final String READ = """
            {"readable":true,"problem":"","supplier":{"name":"Distribuidora Andina S.A.S.","nit":"900.123.456",
             "verificationDigit":"8"},"invoiceNumber":"fv-77","issueDate":"2026-11-02","dueDate":"2026-12-02",
             "paymentType":"CREDIT","subtotal":12500,"taxTotal":950,"total":13450,"globalDiscount":0,
             "lines":[{"description":"ACETAMINOFEN 500 MG X 10","sellerCode":"A-1","barcode":"7702001001001",
               "quantity":2,"unit":"und","packageUnit":false,"unitCost":3200.5,"taxRate":0,"lotNumber":"AB12",
               "expirationDate":"2028-08-31"},
              {"description":"JABON X 3","sellerCode":"","barcode":"123","quantity":1,"unit":"CAJA","packageUnit":true,
               "unitCost":5000,"taxRate":19,"lotNumber":"","expirationDate":"agosto"},
              {"description":"SIN CANTIDAD","sellerCode":"","barcode":"","quantity":0,"unit":"","packageUnit":false,
               "unitCost":1,"taxRate":0,"lotNumber":"","expirationDate":""}]}""";

    private static String apiResponse(String text, String stop) {
        return "{\"content\":[{\"type\":\"text\",\"text\":" + quote(text) + "}],\"stop_reason\":\"" + stop
                + "\",\"usage\":{\"input_tokens\":1834,\"output_tokens\":412}}";
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    @Test
    void readsTheInvoiceAsTheDianParserWould() {
        Result r = AnthropicInvoiceReader.parseResponse(apiResponse(READ, "end_turn"), "claude-haiku-5-5");
        assertThat(r.readable()).isTrue();
        assertThat(r.inputTokens()).isEqualTo(1834);
        assertThat(r.outputTokens()).isEqualTo(412);
        var inv = r.invoice();
        assertThat(inv.supplier().nit()).isEqualTo("900123456");
        assertThat(inv.supplier().verificationDigit()).isEqualTo(8);
        assertThat(inv.number()).isEqualTo("FV-77");
        assertThat(inv.issueDate()).isEqualTo(LocalDate.of(2026, 11, 2));
        assertThat(inv.paymentType()).isEqualTo("CREDIT");
        assertThat(inv.payable()).isEqualByComparingTo("13450");
        // La línea sin cantidad se descarta; el código que no es de barras no se usa como tal; la fecha mala, vacía.
        assertThat(inv.lines()).hasSize(2);
        assertThat(inv.lines().get(0).unitCost()).isEqualByComparingTo(new BigDecimal("3200.50"));
        assertThat(inv.lines().get(0).unitCode()).isEqualTo("UND");
        assertThat(inv.lines().get(0).lotNumber()).isEqualTo("AB12");
        assertThat(inv.lines().get(1).standardCode()).isNull();
        assertThat(inv.lines().get(1).sellerCode()).isNull();
        assertThat(inv.lines().get(1).packageUnit()).isTrue();
        assertThat(inv.lines().get(1).expirationDate()).isNull();
        assertThat(inv.lines().get(1).lineNo()).isEqualTo(2);
    }

    @Test
    void unreadableCutOrBrokenAnswersAreNotAnInvoice() {
        Result blurry = AnthropicInvoiceReader.parseResponse(apiResponse(
                "{\"readable\":false,\"problem\":\"La foto está borrosa.\",\"lines\":[]}", "end_turn"), "m");
        assertThat(blurry.readable()).isFalse();
        assertThat(blurry.problem()).isEqualTo("La foto está borrosa.");
        assertThat(AnthropicInvoiceReader.parseResponse(apiResponse("{\"readable\":true", "max_tokens"), "m").problem())
                .contains("muy larga");
        assertThat(AnthropicInvoiceReader.parseResponse(apiResponse("no es json", "end_turn"), "m").readable()).isFalse();
        assertThat(AnthropicInvoiceReader.parseResponse(apiResponse("", "refusal"), "m").readable()).isFalse();
    }

    @Test
    void sendsPhotosAsImagesAndPdfAsDocumentWithTheFixedFormat() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        AtomicReference<String> key = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/messages", exchange -> {
            key.set(exchange.getRequestHeaders().getFirst("x-api-key")
                    + "|" + exchange.getRequestHeaders().getFirst("anthropic-version"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] out = apiResponse(READ, "end_turn").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, out.length);
            exchange.getResponseBody().write(out);
            exchange.close();
        });
        server.createContext("/v1/caida", exchange -> {
            exchange.sendResponseHeaders(529, -1);
            exchange.close();
        });
        server.start();
        try {
            AiProperties props = new AiProperties("clave-de-prueba", null, 10);
            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            AnthropicInvoiceReader reader = new AnthropicInvoiceReader(props, HttpClient.newHttpClient(),
                    URI.create(base + "/v1/messages"));
            Result r = reader.read(List.of(new Page("image/jpeg", new byte[]{1, 2, 3}),
                    new Page("image/jpeg", new byte[]{4})));
            assertThat(r.readable()).isTrue();
            assertThat(key.get()).isEqualTo("clave-de-prueba|2023-06-01");
            assertThat(body.get()).contains("\"model\":\"claude-haiku-5-5\"")
                    .contains("\"type\":\"image\"").contains("\"media_type\":\"image/jpeg\"")
                    .contains("\"output_config\"").contains("\"json_schema\"").contains("misma factura");
            Map<String, Object> pdf = reader.request(List.of(new Page("application/pdf", new byte[]{9})));
            assertThat(String.valueOf(pdf.get("messages"))).contains("type=document");

            AnthropicInvoiceReader down = new AnthropicInvoiceReader(props, HttpClient.newHttpClient(),
                    URI.create(base + "/v1/caida"));
            assertThatThrownBy(() -> down.read(List.of(new Page("image/jpeg", new byte[]{1}))))
                    .isInstanceOf(InvoiceReader.ReaderUnavailableException.class);
        } finally {
            server.stop(0);
        }
        assertThat(new AiProperties("", null, 0).enabled()).isFalse();
        assertThat(new AiProperties(" ", "", 0).model()).isEqualTo("claude-haiku-5-5");
    }
}
