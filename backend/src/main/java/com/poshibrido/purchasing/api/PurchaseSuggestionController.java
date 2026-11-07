package com.poshibrido.purchasing.api;

import com.poshibrido.ai.application.PurchaseReviewService;
import com.poshibrido.ai.application.PurchaseReviewService.Review;
import com.poshibrido.ai.application.PurchaseReviewService.Usage;
import com.poshibrido.purchasing.application.PurchaseSuggestionService;
import com.poshibrido.purchasing.application.PurchaseSuggestionService.Suggestions;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** "Qué comprar" (decisión 297): pedido sugerido por proveedor y su revisión con XASKA IA. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/purchases/suggestions")
public class PurchaseSuggestionController {

    private final PurchaseSuggestionService suggestions;
    private final PurchaseReviewService reviews;

    public record CoverageRequest(@Min(1) @Max(120) int days) {
    }

    public record OrderedLine(@NotNull UUID productId, @NotNull @DecimalMin("0") BigDecimal quantity) {
    }

    public record ReviewRequest(@NotNull UUID branchId, UUID supplierId, @Valid @Size(max = 500) List<OrderedLine> lines) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('purchases:read')")
    public Suggestions suggestions(@RequestParam UUID branchId) {
        return suggestions.suggestions(branchId);
    }

    @PutMapping("/suppliers/{supplierId}")
    @PreAuthorize("hasAuthority('purchases:receive')")
    public void coverage(@PathVariable UUID supplierId, @Valid @RequestBody CoverageRequest request) {
        suggestions.setCoverageDays(supplierId, request.days());
    }

    @PostMapping("/review")
    @PreAuthorize("hasAuthority('purchases:read') and hasAuthority('ai:ask')")
    public Review review(@Valid @RequestBody ReviewRequest request) {
        Map<UUID, BigDecimal> ordered = new LinkedHashMap<>();
        if (request.lines() != null) {
            request.lines().forEach(l -> ordered.put(l.productId(), l.quantity()));
        }
        return reviews.review(request.branchId(), request.supplierId(), ordered);
    }

    @GetMapping("/review-usage")
    @PreAuthorize("hasAuthority('purchases:read') and hasAuthority('ai:ask')")
    public Usage reviewUsage() {
        return reviews.usage();
    }
}
