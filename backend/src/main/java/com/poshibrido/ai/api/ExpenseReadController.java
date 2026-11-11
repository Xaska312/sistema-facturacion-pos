package com.poshibrido.ai.api;

import com.poshibrido.ai.application.ExpenseReadService;
import com.poshibrido.ai.application.ExpenseReadService.Read;
import com.poshibrido.ai.application.ExpenseReadService.Usage;
import com.poshibrido.shared.error.BusinessRuleException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/**
 * "Leer con Aska" en el gasto (decisión 325): la foto o el PDF del recibo llena el formulario. Lo usa quien registra
 * gastos (fuera de la caja con {@code expenses:manage} o de su caja con {@code cash:operate}) y tiene XASKA IA.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai/expenses")
public class ExpenseReadController {

    static final String CAN = "hasAuthority('ai:ask') and (hasAuthority('expenses:manage') or hasAuthority('cash:operate'))";

    private final ExpenseReadService reader;

    @PostMapping("/read")
    @PreAuthorize(CAN)
    public Read read(@RequestParam("file") MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessRuleException("Sube la foto o el PDF del recibo.");
        }
        if (file.getSize() > 10L * 1024 * 1024) {
            throw new BusinessRuleException("El recibo puede pesar hasta 10 MB.");
        }
        return reader.read(file.getBytes());
    }

    @GetMapping("/usage")
    @PreAuthorize(CAN)
    public Usage usage() {
        return reader.usage();
    }
}
