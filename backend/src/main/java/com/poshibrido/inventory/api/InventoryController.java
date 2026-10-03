package com.poshibrido.inventory.api;

import com.poshibrido.inventory.application.InventoryCommands;
import com.poshibrido.inventory.application.InventoryCommands.Direction;
import com.poshibrido.inventory.application.InventoryCommands.Line;
import com.poshibrido.inventory.application.InventoryDocumentService;
import com.poshibrido.inventory.application.InventoryQueryService;
import com.poshibrido.inventory.application.InventoryViews.AlertRow;
import com.poshibrido.inventory.application.InventoryViews.DocumentView;
import com.poshibrido.inventory.application.InventoryViews.KardexRow;
import com.poshibrido.inventory.application.InventoryViews.StockRow;
import com.poshibrido.inventory.domain.InventoryDocumentType;
import com.poshibrido.inventory.infrastructure.InventoryConsistencyQueries;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
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

import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Inventario. Leer: {@code inventory:read}; saldo inicial, ajustes, conteos y niveles:
 * {@code inventory:adjust}; traslados: {@code inventory:transfer}. Las operaciones que crean documentos
 * aceptan el encabezado {@code Idempotency-Key}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/inventory")
public class InventoryController {

    private static final Set<String> STOCK_SORT = Set.of("name", "sku");

    private final InventoryQueryService queries;
    private final InventoryDocumentService documents;
    private final BusinessSettingsApi settings;

    // ---------------------------------------------------------------- DTOs

    public record LineRequest(@NotNull UUID productId, UUID unitId,
                              @NotNull @DecimalMin("0") @Digits(integer = 10, fraction = 4) BigDecimal quantity,
                              Direction direction,
                              @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal unitCost) {
        Line toLine() {
            return new Line(productId, unitId, quantity, direction, unitCost);
        }
    }

    public record InitialRequest(@NotNull UUID branchId, @Size(max = 500) String notes,
                                 @NotEmpty @Size(max = 500) List<@Valid @NotNull LineRequest> lines) {
    }

    public record AdjustmentRequest(@NotNull UUID branchId, @NotBlank @Size(max = 255) String reason,
                                    @Size(max = 500) String notes,
                                    @NotEmpty @Size(max = 500) List<@Valid @NotNull LineRequest> lines) {
    }

    public record TransferRequest(@NotNull UUID fromBranchId, @NotNull UUID toBranchId, @Size(max = 500) String notes,
                                  @NotEmpty @Size(max = 500) List<@Valid @NotNull LineRequest> lines) {
    }

    public record CountRequest(@NotNull UUID branchId, @Size(max = 255) String reason, @Size(max = 500) String notes,
                               @NotEmpty @Size(max = 500) List<@Valid @NotNull LineRequest> lines) {
    }

    public record StockLevelsRequest(@NotNull UUID branchId, @NotNull UUID productId,
                                     @DecimalMin("0") @Digits(integer = 10, fraction = 4) BigDecimal minStock,
                                     @DecimalMin("0") @Digits(integer = 10, fraction = 4) BigDecimal maxStock) {
    }

    public record ConsistencyResponse(boolean consistent, List<InventoryConsistencyQueries.Mismatch> mismatches) {
    }

    private static List<Line> lines(List<LineRequest> requests) {
        return requests.stream().map(LineRequest::toLine).toList();
    }

    // ---------------------------------------------------------------- consultas

    @GetMapping("/stock")
    @PreAuthorize("hasAuthority('inventory:read')")
    public PageResponse<StockRow> stock(@RequestParam UUID branchId,
                                        @RequestParam(required = false) String search,
                                        @RequestParam(required = false) UUID categoryId,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "20") int size,
                                        @RequestParam(required = false) String sort) {
        return PageResponse.of(queries.stock(branchId, search, categoryId,
                PageRequests.of(page, size, sort, STOCK_SORT, Sort.by("name"))), r -> r);
    }

    @GetMapping("/balance")
    @PreAuthorize("hasAuthority('inventory:read')")
    public StockRow balance(@RequestParam UUID branchId, @RequestParam UUID productId) {
        return queries.balance(branchId, productId);
    }

    /** Productos en o por debajo del mínimo (todas las sucursales si no se indica). */
    @GetMapping("/alerts")
    @PreAuthorize("hasAuthority('inventory:read')")
    public List<AlertRow> alerts(@RequestParam(required = false) UUID branchId) {
        return queries.alerts(branchId);
    }

    @PutMapping("/stock-levels")
    @PreAuthorize("hasAuthority('inventory:adjust')")
    public StockRow stockLevels(@Valid @RequestBody StockLevelsRequest request) {
        return queries.setLevels(request.branchId(), request.productId(), request.minStock(), request.maxStock());
    }

    /** Kardex del producto (más recientes primero). Fechas en la zona horaria del negocio. */
    @GetMapping("/kardex")
    @PreAuthorize("hasAuthority('inventory:read')")
    public PageResponse<KardexRow> kardex(@RequestParam UUID productId,
                                          @RequestParam(required = false) UUID branchId,
                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                          @RequestParam(defaultValue = "0") int page,
                                          @RequestParam(defaultValue = "50") int size) {
        ZoneId zone = zone();
        return PageResponse.of(queries.kardex(productId, branchId,
                from == null ? null : from.atStartOfDay(zone).toInstant(),
                to == null ? null : to.plusDays(1).atStartOfDay(zone).toInstant(), page, size), r -> r);
    }

    @GetMapping("/documents")
    @PreAuthorize("hasAuthority('inventory:read')")
    public PageResponse<DocumentView> documents(@RequestParam(required = false) InventoryDocumentType type,
                                                @RequestParam(required = false) UUID branchId,
                                                @RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "20") int size) {
        return PageResponse.of(queries.documents(type, branchId, page, size), d -> d);
    }

    @GetMapping("/documents/{id}")
    @PreAuthorize("hasAuthority('inventory:read')")
    public DocumentView document(@PathVariable UUID id) {
        return queries.document(id);
    }

    /** Verifica que cada saldo sea igual a la suma de sus movimientos (debe estar siempre vacío). */
    @GetMapping("/consistency")
    @PreAuthorize("hasAuthority('inventory:read')")
    public ConsistencyResponse consistency() {
        List<InventoryConsistencyQueries.Mismatch> mismatches = queries.consistency();
        return new ConsistencyResponse(mismatches.isEmpty(), mismatches);
    }

    // ---------------------------------------------------------------- documentos

    @PostMapping("/initial-balances")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('inventory:adjust')")
    public DocumentView initial(@Valid @RequestBody InitialRequest request,
                                @RequestHeader(name = "Idempotency-Key", required = false) String key) {
        return documents.initial(new InventoryCommands.Initial(request.branchId(), request.notes(), lines(request.lines())), key);
    }

    @PostMapping("/adjustments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('inventory:adjust')")
    public DocumentView adjustment(@Valid @RequestBody AdjustmentRequest request,
                                   @RequestHeader(name = "Idempotency-Key", required = false) String key) {
        return documents.adjustment(new InventoryCommands.Adjustment(request.branchId(), request.reason(),
                request.notes(), lines(request.lines())), key);
    }

    @PostMapping("/transfers")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('inventory:transfer')")
    public DocumentView transfer(@Valid @RequestBody TransferRequest request,
                                 @RequestHeader(name = "Idempotency-Key", required = false) String key) {
        return documents.transfer(new InventoryCommands.Transfer(request.fromBranchId(), request.toBranchId(),
                request.notes(), lines(request.lines())), key);
    }

    @PostMapping("/counts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('inventory:adjust')")
    public DocumentView count(@Valid @RequestBody CountRequest request,
                              @RequestHeader(name = "Idempotency-Key", required = false) String key) {
        return documents.count(new InventoryCommands.Count(request.branchId(), request.reason(), request.notes(),
                lines(request.lines())), key);
    }

    private ZoneId zone() {
        try {
            return ZoneId.of(settings.current().timezone());
        } catch (DateTimeException ex) {
            return ZoneId.of("America/Bogota");
        }
    }
}
