package com.poshibrido.ai.api;

import com.poshibrido.ai.application.CatalogImportService;
import com.poshibrido.ai.application.CatalogImportService.Confirmed;
import com.poshibrido.ai.application.CatalogImportService.Draft;
import com.poshibrido.ai.application.CatalogImportService.Upload;
import com.poshibrido.ai.application.CatalogImportService.Usage;
import com.poshibrido.catalog.application.ProductImportService.ImportReport;
import com.poshibrido.shared.error.BusinessRuleException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** "Cargar con Aska" (decisión 300): lista de precios del proveedor → productos nuevos y costos y precios. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai/catalog")
public class CatalogImportController {

    private final CatalogImportService catalog;

    /** {@code branchId} (decisión 306): la sede del saldo inicial cuando las filas traen cantidad. */
    public record ApplyRequest(UUID supplierId, UUID branchId,
                               @NotNull @Valid @Size(min = 1, max = 500) List<Confirmed> rows) {
    }

    @PostMapping("/read")
    @PreAuthorize("hasAuthority('products:manage') and hasAuthority('ai:ask')")
    public Draft read(@RequestParam("files") List<MultipartFile> files,
                      @RequestParam(required = false) UUID supplierId,
                      @RequestParam(required = false) BigDecimal margin,
                      @RequestParam(defaultValue = "false") boolean inventory,
                      @RequestParam(required = false) UUID branchId) throws IOException {
        if (files == null || files.isEmpty() || files.size() > 10) {
            throw new BusinessRuleException("Sube la lista en un archivo (Excel, CSV o PDF) o hasta 10 fotos.");
        }
        List<Upload> uploads = new ArrayList<>();
        for (MultipartFile f : files) {
            if (f.getSize() > 10L * 1024 * 1024) {
                throw new BusinessRuleException("Cada archivo puede pesar hasta 10 MB.");
            }
            uploads.add(new Upload(f.getOriginalFilename(), f.getBytes()));
        }
        return catalog.read(uploads, supplierId, margin, inventory, branchId);
    }

    @PostMapping("/apply")
    @PreAuthorize("hasAuthority('products:manage') and hasAuthority('ai:ask')")
    public CatalogImportService.Applied apply(@Valid @RequestBody ApplyRequest request) {
        return catalog.apply(request.rows(), request.supplierId(), request.branchId());
    }

    @GetMapping("/usage")
    @PreAuthorize("hasAuthority('products:manage') and hasAuthority('ai:ask')")
    public Usage usage() {
        return catalog.usage();
    }
}
