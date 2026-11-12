package com.poshibrido.finance.api;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.finance.application.WithholdingService;
import com.poshibrido.finance.application.WithholdingService.CustomerWithholding;
import com.poshibrido.finance.application.WithholdingService.Filter;
import com.poshibrido.finance.application.WithholdingService.Summary;
import com.poshibrido.finance.application.WithholdingService.WithholdingView;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.csv.CsvWriter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Retenciones (Finanzas parte B, decisión 322). Reporte y certificados con {@code finance:read}/{@code finance:manage};
 * las retenciones habituales del cliente las lee quien cobra (para sugerirlas) y las cambia {@code finance:manage}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class WithholdingController {

    private final WithholdingService withholdings;
    private final AuditLogger audit;

    public record UsualRequest(@NotNull @Size(max = 3) List<@Valid @NotNull CustomerWithholding> items) {
    }

    public record CertificateRequest(@NotEmpty @Size(max = 500) List<@NotNull UUID> ids, boolean received,
                                     @Size(max = 255) String note) {
    }

    public record CertificateResult(int updated) {
    }

    @GetMapping("/customers/{id}/withholdings")
    @PreAuthorize("hasAnyAuthority('finance:read', 'sales:create', 'orders:create', 'parties:read')")
    public List<CustomerWithholding> usual(@PathVariable UUID id) {
        return withholdings.usual(id);
    }

    @PutMapping("/customers/{id}/withholdings")
    @PreAuthorize("hasAuthority('finance:manage')")
    public List<CustomerWithholding> setUsual(@PathVariable UUID id, @Valid @RequestBody UsualRequest r) {
        return withholdings.setUsual(id, r.items());
    }

    @GetMapping("/withholdings")
    @PreAuthorize("hasAuthority('finance:read')")
    public PageResponse<WithholdingView> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID customerId, @RequestParam(required = false) String type,
            @RequestParam(required = false) String certificate,
            @RequestParam(defaultValue = "false") boolean includeVoided,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return withholdings.list(new Filter(from, to, customerId, type, certificate, includeVoided), page, size);
    }

    @GetMapping("/withholdings/summary")
    @PreAuthorize("hasAuthority('finance:read')")
    public Summary summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID customerId, @RequestParam(required = false) String type,
            @RequestParam(required = false) String certificate) {
        return withholdings.summary(new Filter(from, to, customerId, type, certificate, false));
    }

    @GetMapping("/withholdings.csv")
    @PreAuthorize("hasAuthority('finance:read')")
    public ResponseEntity<byte[]> csv(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID customerId, @RequestParam(required = false) String type,
            @RequestParam(required = false) String certificate,
            @RequestParam(defaultValue = "false") boolean includeVoided) {
        Filter f = withholdings.normalize(new Filter(from, to, customerId, type, certificate, includeVoided));
        CsvWriter writer = withholdings.csv(f);
        String name = "retenciones_" + f.from() + "_a_" + f.to() + ".csv";
        Map<String, Object> exported = new LinkedHashMap<>();
        exported.put("file", name);
        exported.put("rows", writer.dataRows());
        audit.logDetached("REPORT_EXPORTED", "report", null, exported);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(name, StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.parseMediaType(CsvWriter.CONTENT_TYPE))
                .body(writer.toBytes());
    }

    @PostMapping("/withholdings/certificate")
    @PreAuthorize("hasAuthority('finance:manage')")
    public CertificateResult certificate(@Valid @RequestBody CertificateRequest r) {
        return new CertificateResult(withholdings.markCertificate(r.ids(), r.received(), r.note()));
    }
}
