package com.poshibrido.catalog.api;

import com.poshibrido.catalog.application.CumCatalogService;
import com.poshibrido.catalog.application.CumCatalogService.CumRow;
import com.poshibrido.catalog.application.CumCatalogService.ImportInfo;
import com.poshibrido.catalog.application.CumCatalogService.Status;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Catálogo CUM del INVIMA en la consola de plataforma (Fase 13-1, decisión 279). Solo administradores (la ruta
 * {@code /api/v1/platform/**} lo exige). La consola lee el CSV de datos.gov.co y envía las presentaciones en tandas.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/platform/cum")
public class PlatformCumController {

    private final CumCatalogService catalog;

    public record StartRequest(@Size(max = 200) String sourceName) {
    }

    public record RowsRequest(@NotEmpty @Size(max = CumCatalogService.MAX_ROWS_PER_BATCH) List<@Valid CumRow> rows) {
    }

    public record FinishRequest(@Min(1) int total) {
    }

    @GetMapping
    public Status status() {
        return catalog.status();
    }

    @PostMapping("/imports")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, UUID> start(@Valid @RequestBody StartRequest request) {
        return Map.of("id", catalog.start(CurrentActor.requireUserId(), request.sourceName()));
    }

    @PostMapping("/imports/{id}/rows")
    public Map<String, Integer> rows(@PathVariable UUID id, @Valid @RequestBody RowsRequest request) {
        return Map.of("received", catalog.addRows(id, request.rows()));
    }

    @PostMapping("/imports/{id}/finish")
    public ImportInfo finish(@PathVariable UUID id, @Valid @RequestBody FinishRequest request) {
        return catalog.finish(id, request.total(), CurrentActor.requireUserId());
    }
}
