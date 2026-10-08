package com.poshibrido.audit.api;

import com.poshibrido.audit.application.AuditFilter;
import com.poshibrido.audit.application.AuditLabels;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.audit.application.AuditQueryService;
import com.poshibrido.audit.application.AuditViews.ActionOption;
import com.poshibrido.audit.application.AuditViews.ActorOption;
import com.poshibrido.audit.application.AuditViews.Detail;
import com.poshibrido.audit.application.AuditViews.Entry;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.csv.CsvWriter;
import com.poshibrido.shared.csv.ExportGate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
 * Auditoría del negocio (permiso {@code audit:read}): quién hizo qué y cuándo. Fechas {@code AAAA-MM-DD} en la
 * zona horaria del negocio; sin fechas, los últimos 7 días. Solo lectura.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/audit")
@PreAuthorize("hasAuthority('audit:read')")
public class AuditController {

    private final AuditQueryService audits;
    private final AuditLogger auditLogger;
    private final ExportGate exports;

    @GetMapping
    public PageResponse<Entry> list(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                    @RequestParam(required = false) UUID actorId,
                                    @RequestParam(required = false) String entity,
                                    @RequestParam(required = false) String action,
                                    @RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "50") int size) {
        return audits.list(audits.filter(from, to, actorId, entity, action, q), page, size);
    }

    @GetMapping("/{id}")
    public Detail detail(@PathVariable UUID id) {
        return audits.detail(id);
    }

    @GetMapping("/actions")
    public List<ActionOption> actions() {
        return audits.actions();
    }

    @GetMapping("/actors")
    public List<ActorOption> actors() {
        return audits.actors();
    }

    /** CSV para Excel en español. La exportación también queda en la auditoría (AUDIT_EXPORTED). */
    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> csv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                      @RequestParam(required = false) UUID actorId,
                                      @RequestParam(required = false) String entity,
                                      @RequestParam(required = false) String action,
                                      @RequestParam(required = false) String q) {
        AuditFilter filter = audits.filter(from, to, actorId, entity, action, q);
        return exports.run(() -> export(filter));
    }

    private ResponseEntity<byte[]> export(AuditFilter filter) {
        List<Entry> rows = audits.forExport(filter);
        CsvWriter w = new CsvWriter(filter.zone())
                .row("Fecha", "Usuario", "Acción", "Módulo", "Registro", "Id del registro", "IP");
        rows.forEach(r -> w.row(r.createdAt(), r.actorName(), AuditLabels.action(r.action(), r.entity()),
                AuditLabels.entity(r.entity()), r.label(), r.entityId(), r.ip()));

        Map<String, Object> exported = new LinkedHashMap<>();
        exported.put("from", filter.from());
        exported.put("to", filter.to());
        exported.put("rows", rows.size());
        auditLogger.logDetached("AUDIT_EXPORTED", "audit", null, exported);

        ContentDisposition disposition = ContentDisposition.attachment()
                .filename("auditoria_" + filter.label() + ".csv", StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.parseMediaType(CsvWriter.CONTENT_TYPE))
                .body(w.toBytes());
    }
}
