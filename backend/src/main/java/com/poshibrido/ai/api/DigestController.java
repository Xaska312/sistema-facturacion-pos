package com.poshibrido.ai.api;

import com.poshibrido.ai.application.DailyDigestService;
import com.poshibrido.ai.application.DailyDigestService.Digest;
import com.poshibrido.ai.application.DailyDigestService.Settings;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Resumen del día de Aska (decisión 299, XASKA IA). */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai/digest")
public class DigestController {

    private final DailyDigestService digests;

    public record SettingsRequest(@NotNull Boolean enabled, @NotNull @Size(max = 5) String sendTime,
                                  @Size(max = 50) List<UUID> recipients) {
    }

    /** El último resumen (hoy o ayer) con lo que esta persona puede ver; 204 si no hay. */
    @GetMapping("/latest")
    @PreAuthorize("hasAuthority('ai:ask')")
    public ResponseEntity<Digest> latest() {
        Digest d = digests.latest(CurrentActor.permissions());
        return d == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(d);
    }

    @GetMapping("/settings")
    @PreAuthorize("hasAuthority('ai:ask') and hasAuthority('settings:manage')")
    public Settings settings() {
        return digests.settings();
    }

    @PutMapping("/settings")
    @PreAuthorize("hasAuthority('ai:ask') and hasAuthority('settings:manage')")
    public Settings save(@Valid @RequestBody SettingsRequest request) {
        return digests.saveSettings(request.enabled(), request.sendTime(), request.recipients());
    }

    /** Arma y envía el resumen ahora (para probarlo); reemplaza el del día si ya existía. */
    @PostMapping("/run")
    @PreAuthorize("hasAuthority('ai:ask') and hasAuthority('settings:manage')")
    public Digest run() {
        return digests.runNow();
    }
}
