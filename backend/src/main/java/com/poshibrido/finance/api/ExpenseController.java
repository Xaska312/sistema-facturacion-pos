package com.poshibrido.finance.api;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.finance.application.ExpenseCategoryService;
import com.poshibrido.finance.application.ExpenseService;
import com.poshibrido.finance.application.ExpenseService.ClassifyCommand;
import com.poshibrido.finance.application.ExpenseService.CreateCommand;
import com.poshibrido.finance.application.ExpenseService.Filter;
import com.poshibrido.finance.application.ExpenseService.UpdateCommand;
import com.poshibrido.finance.application.ExpenseViews.CategoryView;
import com.poshibrido.finance.application.ExpenseViews.ExpenseView;
import com.poshibrido.finance.application.ExpenseViews.StoredFile;
import com.poshibrido.finance.application.ExpenseViews.Summary;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.csv.CsvWriter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Gastos con categorías (Finanzas parte A, decisión 320). Ver y exportar con {@code expenses:read}; registrar fuera de
 * la caja, corregir, anular, clasificar y configurar categorías con {@code expenses:manage}. El cajero registra el
 * gasto en efectivo de su caja con {@code cash:operate}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class ExpenseController {

    private final ExpenseService expenses;
    private final ExpenseCategoryService categories;
    private final AuditLogger audit;

    public record CreateRequest(@NotNull BigDecimal amount, @NotNull UUID categoryId, @NotNull UUID paymentMethodId,
                                UUID branchId, LocalDate date, UUID supplierId, @Size(max = 100) String reference,
                                @Size(max = 255) String note) {
    }

    public record UpdateRequest(@NotNull UUID categoryId, LocalDate date, UUID supplierId,
                                @Size(max = 100) String reference, @Size(max = 255) String note) {
    }

    public record ClassifyRequest(@NotNull UUID categoryId, UUID supplierId, @Size(max = 255) String note) {
    }

    public record VoidRequest(@NotNull @Size(max = 255) String reason) {
    }

    public record CategoryRequest(@Size(max = 60) String name, Boolean active) {
    }

    // ------------------------------------------------------------------ categorías

    @GetMapping("/expense-categories")
    @PreAuthorize("hasAnyAuthority('expenses:read', 'expenses:manage', 'cash:operate')")
    public List<CategoryView> categories(@RequestParam(defaultValue = "false") boolean includeInactive) {
        return categories.list(includeInactive);
    }

    @PostMapping("/expense-categories")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('expenses:manage')")
    public CategoryView createCategory(@Valid @RequestBody CategoryRequest r) {
        return categories.create(r.name());
    }

    @PutMapping("/expense-categories/{id}")
    @PreAuthorize("hasAuthority('expenses:manage')")
    public CategoryView updateCategory(@PathVariable UUID id, @Valid @RequestBody CategoryRequest r) {
        return categories.update(id, r.name(), r.active());
    }

    // ------------------------------------------------------------------ gastos

    @GetMapping("/expenses")
    @PreAuthorize("hasAuthority('expenses:read')")
    public PageResponse<ExpenseView> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID categoryId, @RequestParam(required = false) UUID branchId,
            @RequestParam(required = false) UUID supplierId, @RequestParam(required = false) UUID paymentMethodId,
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "false") boolean unclassified,
            @RequestParam(defaultValue = "false") boolean includeVoided,
            @RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return expenses.list(new Filter(from, to, categoryId, branchId, supplierId, paymentMethodId, source,
                unclassified, includeVoided, q), page, size);
    }

    @GetMapping("/expenses/summary")
    @PreAuthorize("hasAuthority('expenses:read')")
    public Summary summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID categoryId, @RequestParam(required = false) UUID branchId,
            @RequestParam(required = false) UUID supplierId, @RequestParam(required = false) UUID paymentMethodId,
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "false") boolean unclassified, @RequestParam(required = false) String q) {
        return expenses.summary(new Filter(from, to, categoryId, branchId, supplierId, paymentMethodId, source,
                unclassified, false, q));
    }

    /** El listado para Excel. Cada exportación queda en la auditoría (REPORT_EXPORTED). */
    @GetMapping("/expenses.csv")
    @PreAuthorize("hasAuthority('expenses:read')")
    public ResponseEntity<byte[]> csv(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID categoryId, @RequestParam(required = false) UUID branchId,
            @RequestParam(required = false) UUID supplierId, @RequestParam(required = false) UUID paymentMethodId,
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "false") boolean unclassified,
            @RequestParam(defaultValue = "false") boolean includeVoided, @RequestParam(required = false) String q) {
        Filter f = expenses.normalize(new Filter(from, to, categoryId, branchId, supplierId, paymentMethodId, source,
                unclassified, includeVoided, q));
        CsvWriter writer = expenses.csv(f);
        String name = "gastos_" + f.from() + "_a_" + f.to() + ".csv";
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

    @GetMapping("/expenses/{id}")
    @PreAuthorize("hasAuthority('expenses:read')")
    public ExpenseView get(@PathVariable UUID id) {
        return expenses.get(id);
    }

    /** Con {@code cash:operate} y sin {@code expenses:manage}, solo en efectivo desde la caja propia. */
    @PostMapping("/expenses")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('expenses:manage', 'cash:operate')")
    public ExpenseView create(@Valid @RequestBody CreateRequest r,
                              @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return expenses.create(new CreateCommand(r.amount(), r.categoryId(), r.paymentMethodId(), r.branchId(),
                r.date(), r.supplierId(), r.reference(), r.note()), key);
    }

    @PutMapping("/expenses/{id}")
    @PreAuthorize("hasAuthority('expenses:manage')")
    public ExpenseView update(@PathVariable UUID id, @Valid @RequestBody UpdateRequest r) {
        return expenses.update(id, new UpdateCommand(r.categoryId(), r.date(), r.supplierId(), r.reference(), r.note()));
    }

    @PostMapping("/expenses/{id}/void")
    @PreAuthorize("hasAuthority('expenses:manage')")
    public ExpenseView voidExpense(@PathVariable UUID id, @Valid @RequestBody VoidRequest r) {
        return expenses.voidExpense(id, r.reason());
    }

    /** Clasifica un egreso de caja de antes ({@code movementId} es el id que trae en el listado). */
    @PostMapping("/expenses/unclassified/{movementId}/classify")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('expenses:manage')")
    public ExpenseView classify(@PathVariable UUID movementId, @Valid @RequestBody ClassifyRequest r) {
        return expenses.classify(movementId, new ClassifyCommand(r.categoryId(), r.supplierId(), r.note()));
    }

    /** Foto (JPG o PNG) o PDF del soporte, hasta 5 MB. La sube quien registró el gasto o quien administra gastos. */
    @PostMapping("/expenses/{id}/document")
    @PreAuthorize("hasAnyAuthority('expenses:manage', 'cash:operate')")
    public ExpenseView attach(@PathVariable UUID id, @RequestParam("file") MultipartFile file) throws IOException {
        return expenses.attach(id, file.getOriginalFilename(), file.getBytes());
    }

    /** Descarga el soporte (siempre como adjunto, nunca para mostrarse en la página). */
    @GetMapping("/expenses/{id}/document")
    @PreAuthorize("hasAuthority('expenses:read')")
    public ResponseEntity<byte[]> document(@PathVariable UUID id) {
        StoredFile f = expenses.document(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(f.fileName(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(f.contentType()))
                .body(f.content());
    }
}
