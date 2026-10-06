package com.poshibrido.reporting.api;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.reporting.application.ReportFilter;
import com.poshibrido.reporting.application.ReportPeriod;
import com.poshibrido.reporting.application.ReportQueryService;
import com.poshibrido.reporting.application.ReportViews.CategoryRow;
import com.poshibrido.reporting.application.ReportViews.Dashboard;
import com.poshibrido.reporting.application.ReportViews.InventoryRow;
import com.poshibrido.reporting.application.ReportViews.InventoryValuation;
import com.poshibrido.reporting.application.ReportViews.MyDay;
import com.poshibrido.reporting.application.ReportViews.PaymentRow;
import com.poshibrido.reporting.application.ReportViews.ProductRow;
import com.poshibrido.reporting.application.ReportViews.SaleLine;
import com.poshibrido.reporting.application.ReportViews.SalesRow;
import com.poshibrido.reporting.application.ReportViews.Summary;
import com.poshibrido.reporting.application.ReportViews.TaxRow;
import com.poshibrido.shared.csv.CsvWriter;
import com.poshibrido.shared.security.CurrentActor;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Reportes y tablero (permiso {@code reports:read}); "mis ventas de hoy" con {@code sales:read}. Fechas
 * {@code AAAA-MM-DD} en la zona horaria del negocio; sin fechas = hoy. Cada reporte tiene su versión
 * {@code .csv} para Excel en español.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportQueryService reports;
    private final AuditLogger audit;

    // ---------------------------------------------------------------- JSON

    @GetMapping("/dashboard")
    @PreAuthorize("hasAuthority('reports:read')")
    public Dashboard dashboard(@RequestParam(required = false) UUID branchId) {
        return reports.dashboard(branchId);
    }

    @GetMapping("/my-day")
    @PreAuthorize("hasAuthority('sales:read')")
    public MyDay myDay() {
        return reports.myDay(CurrentActor.requireUserId());
    }

    @GetMapping("/sales/summary")
    @PreAuthorize("hasAuthority('reports:read')")
    public Summary summary(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                           @RequestParam(required = false) UUID branchId,
                           @RequestParam(required = false) UUID sellerId) {
        return reports.summary(filter(from, to, branchId, sellerId));
    }

    @GetMapping("/sales/by-day")
    @PreAuthorize("hasAuthority('reports:read')")
    public List<SalesRow> byDay(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                @RequestParam(required = false) UUID branchId,
                                @RequestParam(required = false) UUID sellerId) {
        return reports.byDay(filter(from, to, branchId, sellerId));
    }

    @GetMapping("/sales/by-branch")
    @PreAuthorize("hasAuthority('reports:read')")
    public List<SalesRow> byBranch(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                   @RequestParam(required = false) UUID branchId,
                                   @RequestParam(required = false) UUID sellerId) {
        return reports.byBranch(filter(from, to, branchId, sellerId));
    }

    @GetMapping("/sales/by-seller")
    @PreAuthorize("hasAuthority('reports:read')")
    public List<SalesRow> bySeller(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                   @RequestParam(required = false) UUID branchId,
                                   @RequestParam(required = false) UUID sellerId) {
        return reports.bySeller(filter(from, to, branchId, sellerId));
    }

    @GetMapping("/sales/by-payment-method")
    @PreAuthorize("hasAuthority('reports:read')")
    public List<PaymentRow> byPaymentMethod(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                            @RequestParam(required = false) UUID branchId,
                                            @RequestParam(required = false) UUID sellerId) {
        return reports.byPaymentMethod(filter(from, to, branchId, sellerId));
    }

    /** {@code orderBy=total} (valor vendido, por defecto) o {@code quantity}. */
    @GetMapping("/products")
    @PreAuthorize("hasAuthority('reports:read')")
    public List<ProductRow> products(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                     @RequestParam(required = false) UUID branchId,
                                     @RequestParam(required = false) UUID sellerId,
                                     @RequestParam(defaultValue = "50") int limit,
                                     @RequestParam(defaultValue = "total") String orderBy) {
        return reports.topProducts(filter(from, to, branchId, sellerId), limit, "quantity".equals(orderBy));
    }

    @GetMapping("/categories")
    @PreAuthorize("hasAuthority('reports:read')")
    public List<CategoryRow> categories(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                        @RequestParam(required = false) UUID branchId,
                                        @RequestParam(required = false) UUID sellerId) {
        return reports.byCategory(filter(from, to, branchId, sellerId));
    }

    @GetMapping("/taxes")
    @PreAuthorize("hasAuthority('reports:read')")
    public List<TaxRow> taxes(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                              @RequestParam(required = false) UUID branchId,
                              @RequestParam(required = false) UUID sellerId) {
        return reports.taxes(filter(from, to, branchId, sellerId));
    }

    @GetMapping("/inventory/valuation")
    @PreAuthorize("hasAuthority('reports:read')")
    public InventoryValuation inventoryValuation(@RequestParam(required = false) UUID branchId) {
        return reports.inventoryValuation(branchId);
    }

    // ---------------------------------------------------------------- CSV

    @GetMapping("/sales/by-day.csv")
    @PreAuthorize("hasAuthority('reports:read')")
    public ResponseEntity<byte[]> byDayCsv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                           @RequestParam(required = false) UUID branchId,
                                           @RequestParam(required = false) UUID sellerId) {
        ReportFilter f = filter(from, to, branchId, sellerId);
        return csv("ventas-por-dia", f.period(), salesRows("Fecha", reports.byDay(f)));
    }

    @GetMapping("/sales/by-branch.csv")
    @PreAuthorize("hasAuthority('reports:read')")
    public ResponseEntity<byte[]> byBranchCsv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                              @RequestParam(required = false) UUID branchId,
                                              @RequestParam(required = false) UUID sellerId) {
        ReportFilter f = filter(from, to, branchId, sellerId);
        return csv("ventas-por-sucursal", f.period(), salesRows("Sucursal", reports.byBranch(f)));
    }

    @GetMapping("/sales/by-seller.csv")
    @PreAuthorize("hasAuthority('reports:read')")
    public ResponseEntity<byte[]> bySellerCsv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                              @RequestParam(required = false) UUID branchId,
                                              @RequestParam(required = false) UUID sellerId) {
        ReportFilter f = filter(from, to, branchId, sellerId);
        return csv("ventas-por-vendedor", f.period(), salesRows("Vendedor", reports.bySeller(f)));
    }

    @GetMapping("/sales/by-payment-method.csv")
    @PreAuthorize("hasAuthority('reports:read')")
    public ResponseEntity<byte[]> byPaymentMethodCsv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                     @RequestParam(required = false) UUID branchId,
                                                     @RequestParam(required = false) UUID sellerId) {
        ReportFilter f = filter(from, to, branchId, sellerId);
        CsvWriter w = writer().row("Medio de pago", "Pagos", "Valor");
        reports.byPaymentMethod(f).forEach(r -> w.row(r.name(), r.count(), r.amount()));
        return csv("ventas-por-medio-de-pago", f.period(), w);
    }

    @GetMapping("/products.csv")
    @PreAuthorize("hasAuthority('reports:read')")
    public ResponseEntity<byte[]> productsCsv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                              @RequestParam(required = false) UUID branchId,
                                              @RequestParam(required = false) UUID sellerId,
                                              @RequestParam(defaultValue = "1000") int limit,
                                              @RequestParam(defaultValue = "total") String orderBy) {
        ReportFilter f = filter(from, to, branchId, sellerId);
        CsvWriter w = writer().row("SKU", "Producto", "Categoría", "Unidad", "Cantidad", "Base", "Total", "Costo",
                "Utilidad", "Margen %");
        reports.topProducts(f, limit, "quantity".equals(orderBy)).forEach(r -> w.row(r.sku(), r.name(),
                r.categoryName(), r.unitCode(), r.quantity(), r.subtotal(), r.total(), r.cost(), r.profit(),
                r.marginPercent()));
        return csv("productos-vendidos", f.period(), w);
    }

    @GetMapping("/categories.csv")
    @PreAuthorize("hasAuthority('reports:read')")
    public ResponseEntity<byte[]> categoriesCsv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                @RequestParam(required = false) UUID branchId,
                                                @RequestParam(required = false) UUID sellerId) {
        ReportFilter f = filter(from, to, branchId, sellerId);
        CsvWriter w = writer().row("Categoría", "Base", "Total", "Costo", "Utilidad", "Margen %");
        reports.byCategory(f).forEach(r -> w.row(r.categoryName(), r.subtotal(), r.total(), r.cost(), r.profit(),
                r.marginPercent()));
        return csv("ventas-por-categoria", f.period(), w);
    }

    @GetMapping("/taxes.csv")
    @PreAuthorize("hasAuthority('reports:read')")
    public ResponseEntity<byte[]> taxesCsv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                           @RequestParam(required = false) UUID branchId,
                                           @RequestParam(required = false) UUID sellerId) {
        ReportFilter f = filter(from, to, branchId, sellerId);
        CsvWriter w = writer().row("Impuesto", "Tarifa %", "Ventas", "Base", "Impuesto");
        reports.taxes(f).forEach(r -> w.row(r.taxType(), r.taxRate(), r.salesCount(), r.taxableBase(), r.taxAmount()));
        return csv("impuestos", f.period(), w);
    }

    @GetMapping("/sales.csv")
    @PreAuthorize("hasAuthority('reports:read')")
    public ResponseEntity<byte[]> salesCsv(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                           @RequestParam(required = false) UUID branchId,
                                           @RequestParam(required = false) UUID sellerId) {
        ReportFilter f = filter(from, to, branchId, sellerId);
        CsvWriter w = writer().row("Número", "Fecha", "Estado", "Sucursal", "Caja", "Vendedor", "Documento cliente",
                "Cliente", "Descuentos", "Base", "Impuestos", "Total", "Medios de pago");
        List<SaleLine> lines = reports.saleLines(f);
        lines.forEach(r -> w.row(r.documentNumber(), r.createdAt(), r.status(), r.branchName(), r.registerCode(),
                r.sellerName(), r.customerDocument(), r.customerName(), r.discountTotal(), r.subtotal(),
                r.taxTotal(), r.total(), r.paymentMethods()));
        return csv("ventas", f.period(), w);
    }

    @GetMapping("/inventory/valuation.csv")
    @PreAuthorize("hasAuthority('reports:read')")
    public ResponseEntity<byte[]> inventoryValuationCsv(@RequestParam(required = false) UUID branchId) {
        CsvWriter w = writer().row("Sucursal", "SKU", "Producto", "Categoría", "Unidad", "Existencia",
                "Costo promedio", "Valor");
        InventoryValuation valuation = reports.inventoryValuation(branchId);
        for (InventoryRow r : valuation.rows()) {
            w.row(r.branchName(), r.sku(), r.name(), r.categoryName(), r.unitCode(), r.quantity(), r.averageCost(),
                    r.value());
        }
        w.row("Total", null, null, null, null, null, null, valuation.totalValue());
        // Sin contar la fila de total.
        return file("inventario-valorizado_" + reports.today(), w, valuation.rows().size());
    }

    // ---------------------------------------------------------------- apoyo

    private ReportFilter filter(LocalDate from, LocalDate to, UUID branchId, UUID sellerId) {
        return new ReportFilter(reports.period(from, to), branchId, sellerId);
    }

    private CsvWriter writer() {
        return new CsvWriter(reports.zone());
    }

    private CsvWriter salesRows(String keyHeader, List<SalesRow> rows) {
        CsvWriter w = writer().row(keyHeader, "Ventas", "Base", "Impuestos", "Total", "Ticket promedio", "Costo",
                "Utilidad", "Margen %");
        rows.forEach(r -> w.row(r.label(), r.salesCount(), r.subtotal(), r.taxTotal(), r.total(), r.averageTicket(),
                r.cost(), r.profit(), r.marginPercent()));
        return w;
    }

    private ResponseEntity<byte[]> csv(String name, ReportPeriod period, CsvWriter writer) {
        return file(name + "_" + period.label(), writer, writer.dataRows());
    }

    /** Descarga del CSV. Cada exportación queda en la auditoría (REPORT_EXPORTED): datos que salen del sistema. */
    private ResponseEntity<byte[]> file(String baseName, CsvWriter writer, int rows) {
        Map<String, Object> exported = new LinkedHashMap<>();
        exported.put("file", baseName + ".csv");
        exported.put("rows", rows);
        audit.logDetached("REPORT_EXPORTED", "report", null, exported);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(baseName + ".csv", StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.parseMediaType(CsvWriter.CONTENT_TYPE))
                .body(writer.toBytes());
    }
}
