package com.poshibrido.pharmacy.api;

import com.poshibrido.pharmacy.application.QualityService;
import com.poshibrido.pharmacy.application.QualityService.AdverseEventInput;
import com.poshibrido.pharmacy.application.QualityService.AdverseEventView;
import com.poshibrido.pharmacy.application.QualityService.PointInput;
import com.poshibrido.pharmacy.application.QualityService.PointView;
import com.poshibrido.pharmacy.application.QualityService.ReadingView;
import com.poshibrido.pharmacy.application.QualityService.Today;
import com.poshibrido.pharmacy.application.VisitReportService;
import com.poshibrido.pharmacy.application.VisitReportService.VisitReport;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Calidad de la droguería (Fase 13-6, decisión 287), con el módulo Medicamentos: temperatura y humedad, eventos
 * adversos e informe para la visita de la Secretaría de Salud.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/pharmacy")
@PreAuthorize("hasAuthority('pharmacy:quality') and hasAuthority('module:medicines')")
public class QualityController {

    private final QualityService quality;
    private final VisitReportService visit;

    public record PointRequest(@NotBlank @Size(max = 60) String name, @Size(max = 10) String kind,
                               @NotNull BigDecimal tempMin, @NotNull BigDecimal tempMax, BigDecimal humidityMin,
                               BigDecimal humidityMax, Boolean active) {
    }

    public record ReadingRequest(@NotNull UUID pointId, @NotBlank @Size(max = 10) String shift,
                                 @NotNull BigDecimal temperature, BigDecimal humidity,
                                 @Size(max = 300) String actionTaken) {
    }

    public record AdverseEventRequest(UUID branchId, @NotNull LocalDate occurredOn,
                                      @NotBlank @Size(max = 160) String patientName,
                                      @Size(max = 20) String patientDocument, @Min(0) @Max(130) Integer patientAge,
                                      UUID productId, @Size(max = 200) String productName,
                                      @Size(max = 40) String lotNumber,
                                      @NotBlank @Size(max = 1000) String description, boolean serious,
                                      LocalDate reportedOn, @Size(max = 60) String invimaReference) {
    }

    public record ReportRequest(@NotNull LocalDate reportedOn, @Size(max = 60) String invimaReference) {
    }

    @GetMapping("/quality/today")
    public Today today(@RequestParam(required = false) UUID branchId) {
        return quality.today(branchId);
    }

    @GetMapping("/quality/points")
    public List<PointView> points(@RequestParam(required = false) UUID branchId) {
        return quality.points(branchId);
    }

    @PostMapping("/quality/points")
    @ResponseStatus(HttpStatus.CREATED)
    public PointView createPoint(@RequestParam(required = false) UUID branchId, @Valid @RequestBody PointRequest r) {
        return quality.createPoint(branchId, new PointInput(r.name(), r.kind(), r.tempMin(), r.tempMax(),
                r.humidityMin(), r.humidityMax(), r.active()));
    }

    @PutMapping("/quality/points/{id}")
    public PointView updatePoint(@PathVariable UUID id, @Valid @RequestBody PointRequest r) {
        return quality.updatePoint(id, new PointInput(r.name(), r.kind(), r.tempMin(), r.tempMax(), r.humidityMin(),
                r.humidityMax(), r.active()));
    }

    @PostMapping("/quality/readings")
    @ResponseStatus(HttpStatus.CREATED)
    public ReadingView record(@Valid @RequestBody ReadingRequest r) {
        return quality.record(r.pointId(), r.shift(), r.temperature(), r.humidity(), r.actionTaken());
    }

    @GetMapping("/quality/readings")
    public List<ReadingView> readings(@RequestParam(required = false) UUID branchId,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return quality.readings(branchId, from, to);
    }

    @GetMapping("/adverse-events")
    public List<AdverseEventView> adverseEvents(@RequestParam(required = false) UUID branchId,
                                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return quality.adverseEvents(branchId, from, to);
    }

    @PostMapping("/adverse-events")
    @ResponseStatus(HttpStatus.CREATED)
    public AdverseEventView createAdverseEvent(@Valid @RequestBody AdverseEventRequest r) {
        return quality.createAdverseEvent(new AdverseEventInput(r.branchId(), r.occurredOn(), r.patientName(),
                r.patientDocument(), r.patientAge(), r.productId(), r.productName(), r.lotNumber(), r.description(),
                r.serious(), r.reportedOn(), r.invimaReference()));
    }

    @PutMapping("/adverse-events/{id}/report")
    public AdverseEventView report(@PathVariable UUID id, @Valid @RequestBody ReportRequest r) {
        return quality.reportAdverseEvent(id, r.reportedOn(), r.invimaReference());
    }

    @GetMapping("/visit-report")
    public VisitReport visitReport(@RequestParam(required = false) UUID branchId,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return visit.report(branchId, from, to);
    }
}
