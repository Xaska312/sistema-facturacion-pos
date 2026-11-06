package com.poshibrido.purchasing.api;

import com.poshibrido.purchasing.application.InvoiceDocumentService;
import com.poshibrido.purchasing.application.InvoiceDocumentService.InvoiceDraft;
import com.poshibrido.purchasing.application.InvoiceDocumentService.StoredFile;
import com.poshibrido.shared.error.BusinessRuleException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * La factura del proveedor (decisión 290): se carga para llenar la recepción y queda como soporte de la compra.
 * Cargarla no registra nada: devuelve un borrador para revisar en "Recibir mercancía".
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/purchases/documents")
public class PurchaseDocumentController {

    private final InvoiceDocumentService documents;

    @PostMapping
    @PreAuthorize("hasAuthority('purchases:import') and hasAuthority('purchases:receive')")
    public InvoiceDraft upload(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new BusinessRuleException("El archivo está vacío.");
        }
        if (file.getSize() > InvoiceDocumentService.MAX_BYTES) {
            throw new BusinessRuleException("El archivo supera 5 MB.");
        }
        return documents.upload(file.getOriginalFilename(), file.getBytes());
    }

    /** Descarga el soporte (siempre como adjunto, nunca para mostrarse en la página). */
    @GetMapping("/{id}/file")
    @PreAuthorize("hasAuthority('purchases:read')")
    public ResponseEntity<byte[]> file(@PathVariable UUID id) {
        StoredFile f = documents.file(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(f.fileName(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(f.contentType()))
                .body(f.content());
    }
}
