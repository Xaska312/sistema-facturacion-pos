package com.poshibrido.purchasing.application;

import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedInvoice;
import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedLine;
import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedSupplier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Lector de facturas con Claude (decisión 295): manda las fotos (JPEG) o el PDF a la API de mensajes de Anthropic con
 * instrucciones fijas ({@code ai/invoice-prompt.txt}) y una salida en formato JSON obligatorio
 * ({@code ai/invoice-schema.json}), y lo convierte en la misma estructura que el lector del XML de la DIAN. El texto de
 * la factura es dato, nunca instrucción (lo dicen las instrucciones, y lo que vuelve solo llena un borrador que una
 * persona revisa).
 */
@Slf4j
@Component
public class AnthropicInvoiceReader implements InvoiceReader {

    static final URI ENDPOINT = URI.create("https://api.anthropic.com/v1/messages");
    static final int MAX_TOKENS = 8000;
    static final int MAX_LINES = 300;

    private static final ObjectMapper JSON = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();

    private final AiProperties properties;
    private final HttpClient http;
    private final URI endpoint;
    private final String prompt;
    private final Map<String, Object> schema;

    @Autowired
    public AnthropicInvoiceReader(AiProperties properties) {
        this(properties, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build(), ENDPOINT);
    }

    AnthropicInvoiceReader(AiProperties properties, HttpClient http, URI endpoint) {
        this.properties = properties;
        this.http = http;
        this.endpoint = endpoint;
        this.prompt = resource("ai/invoice-prompt.txt");
        this.schema = JSON.readValue(resource("ai/invoice-schema.json"), Map.class);
    }

    @Override
    public boolean available() {
        return properties.enabled();
    }

    @Override
    public Result read(List<Page> pages) {
        String body = JSON.writeValueAsString(request(pages));
        HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(properties.timeout()))
                .header("x-api-key", properties.anthropicApiKey())
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException ex) {
            throw new ReaderUnavailableException("La lectura con IA no respondió.", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ReaderUnavailableException("La lectura con IA se interrumpió.", ex);
        }
        if (response.statusCode() / 100 != 2) {
            String detail = response.body() == null ? "" : response.body();
            log.warn("La API de Anthropic respondió {}: {}", response.statusCode(),
                    detail.substring(0, Math.min(300, detail.length())));
            throw new ReaderUnavailableException("La lectura con IA respondió " + response.statusCode() + ".", null);
        }
        return parseResponse(response.body(), properties.model());
    }

    /** El cuerpo de la petición: instrucciones, las fotos o el PDF y el formato de salida. */
    Map<String, Object> request(List<Page> pages) {
        List<Object> content = new ArrayList<>();
        for (Page page : pages) {
            Map<String, Object> source = new LinkedHashMap<>();
            source.put("type", "base64");
            source.put("media_type", page.mediaType());
            source.put("data", Base64.getEncoder().encodeToString(page.content()));
            content.add(Map.of("type", "application/pdf".equals(page.mediaType()) ? "document" : "image",
                    "source", source));
        }
        content.add(Map.of("type", "text", "text", pages.size() > 1
                ? "Estas " + pages.size() + " fotos son de la misma factura. Léela."
                : "Lee esta factura."));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.model());
        body.put("max_tokens", MAX_TOKENS);
        body.put("system", prompt);
        body.put("messages", List.of(Map.of("role", "user", "content", content)));
        body.put("output_config", Map.of("format", Map.of("type", "json_schema", "schema", schema)));
        return body;
    }

    /** Respuesta de la API → resultado. Una respuesta que no cumple el formato se trata como "no se pudo leer". */
    @SuppressWarnings("unchecked")
    static Result parseResponse(String body, String model) {
        Map<String, Object> response = JSON.readValue(body, Map.class);
        Map<String, Object> usage = map(response.get("usage"));
        int input = number(usage.get("input_tokens")).intValue();
        int output = number(usage.get("output_tokens")).intValue();
        String stop = text(response.get("stop_reason"));
        if ("max_tokens".equals(stop)) {
            return new Result(null, "La factura es muy larga para leerla de una vez: súbela por partes o ingrésala a mano.",
                    model, input, output);
        }
        if ("refusal".equals(stop)) {
            return new Result(null, "No se pudo leer esta factura. Ingrésala a mano.", model, input, output);
        }
        String json = null;
        for (Object block : (List<Object>) response.getOrDefault("content", List.of())) {
            Map<String, Object> b = map(block);
            if ("text".equals(b.get("type"))) {
                json = text(b.get("text"));
            }
        }
        if (json == null) {
            return new Result(null, "No se pudo leer esta factura. Ingrésala a mano.", model, input, output);
        }
        try {
            return toResult(JSON.readValue(json, Map.class), model, input, output);
        } catch (RuntimeException ex) {
            log.warn("La lectura de la factura no cumplió el formato: {}", ex.getMessage());
            return new Result(null, "No se pudo leer esta factura. Ingrésala a mano.", model, input, output);
        }
    }

    @SuppressWarnings("unchecked")
    static Result toResult(Map<String, Object> read, String model, int input, int output) {
        if (!Boolean.TRUE.equals(read.get("readable"))) {
            String problem = clip(text(read.get("problem")), 200);
            return new Result(null, problem == null ? "No se pudo leer la factura." : problem, model, input, output);
        }
        Map<String, Object> s = map(read.get("supplier"));
        String nit = digits(text(s.get("nit")));
        String dv = digits(text(s.get("verificationDigit")));
        ParsedSupplier supplier = new ParsedSupplier(nit == null ? null : clip(nit, 15),
                dv != null && dv.length() == 1 ? Integer.valueOf(dv) : null, clip(text(s.get("name")), 160));
        List<ParsedLine> lines = new ArrayList<>();
        for (Object o : (List<Object>) read.getOrDefault("lines", List.of())) {
            Map<String, Object> l = map(o);
            BigDecimal quantity = money(l.get("quantity"), 4);
            if (quantity.signum() <= 0 || lines.size() >= MAX_LINES) {
                continue;
            }
            String barcode = digits(text(l.get("barcode")));
            String unit = clip(text(l.get("unit")), 10);
            lines.add(new ParsedLine(lines.size() + 1, clip(text(l.get("description")), 200),
                    clip(text(l.get("sellerCode")), 60),
                    barcode != null && barcode.length() >= 8 && barcode.length() <= 14 ? barcode : null,
                    unit == null ? null : unit.toUpperCase(Locale.ROOT), Boolean.TRUE.equals(l.get("packageUnit")),
                    quantity, money(l.get("unitCost"), 2).max(BigDecimal.ZERO), money(l.get("taxRate"), 2).max(BigDecimal.ZERO),
                    BigDecimal.ZERO, clip(text(l.get("lotNumber")), 40), date(text(l.get("expirationDate")))));
        }
        String payment = text(read.get("paymentType"));
        String number = clip(text(read.get("invoiceNumber")), 40);
        BigDecimal total = money(read.get("total"), 2);
        BigDecimal subtotal = money(read.get("subtotal"), 2);
        BigDecimal taxTotal = money(read.get("taxTotal"), 2);
        ParsedInvoice invoice = new ParsedInvoice(supplier, number == null ? null : number.toUpperCase(Locale.ROOT),
                date(text(read.get("issueDate"))), date(text(read.get("dueDate"))),
                "PAID".equalsIgnoreCase(payment) ? "PAID" : "CREDIT".equalsIgnoreCase(payment) ? "CREDIT" : null,
                null, subtotal.signum() > 0 ? subtotal : null, taxTotal.signum() > 0 ? taxTotal : null,
                total.signum() > 0 ? total : null, money(read.get("globalDiscount"), 2).max(BigDecimal.ZERO), false,
                List.copyOf(lines));
        return new Result(invoice, null, model, input, output);
    }

    private static Map<String, Object> map(Object o) {
        @SuppressWarnings("unchecked")
        Map<String, Object> m = o instanceof Map<?, ?> ? (Map<String, Object>) o : Map.of();
        return m;
    }

    private static String text(Object o) {
        if (o == null) {
            return null;
        }
        String s = o.toString().strip();
        return s.isEmpty() ? null : s;
    }

    private static String clip(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }

    private static String digits(String s) {
        if (s == null) {
            return null;
        }
        String d = s.replaceAll("\\D", "");
        return d.isEmpty() ? null : d;
    }

    private static BigDecimal number(Object o) {
        if (o instanceof BigDecimal d) {
            return d;
        }
        if (o instanceof Number n) {
            return new BigDecimal(n.toString());
        }
        return BigDecimal.ZERO;
    }

    private static BigDecimal money(Object o, int scale) {
        return number(o).setScale(scale, RoundingMode.HALF_UP);
    }

    private static LocalDate date(String s) {
        if (s == null) {
            return null;
        }
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    private static String resource(String path) {
        try {
            return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }
}
