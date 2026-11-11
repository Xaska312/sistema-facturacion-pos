package com.poshibrido.finance.api;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.finance.application.IncomeStatementService;
import com.poshibrido.finance.application.IncomeStatementService.Report;
import com.poshibrido.shared.csv.CsvWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Estado de resultados (Finanzas parte C, decisión 323), con {@code finance:read}. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/finance")
public class IncomeStatementController {

    private final IncomeStatementService statements;
    private final AuditLogger audit;

    @GetMapping("/income-statement")
    @PreAuthorize("hasAuthority('finance:read')")
    public Report report(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                         @RequestParam(required = false) UUID branchId) {
        return statements.report(from, to, branchId);
    }

    @GetMapping("/income-statement.csv")
    @PreAuthorize("hasAuthority('finance:read')")
    public ResponseEntity<byte[]> csv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                      @RequestParam(required = false) UUID branchId) {
        Report r = statements.report(from, to, branchId);
        CsvWriter writer = statements.csv(r);
        String name = "estado-de-resultados_" + r.current().from() + "_a_" + r.current().to() + ".csv";
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
}
