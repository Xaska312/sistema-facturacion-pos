package com.poshibrido.pharmacy.application;

import com.poshibrido.inventory.application.LotQueryService;
import com.poshibrido.inventory.application.LotQueryService.LotRow;
import com.poshibrido.inventory.application.LotQueryService.LotStatus;
import com.poshibrido.organization.application.BrandingService;
import com.poshibrido.pharmacy.application.PharmacyService.TechnicalDirector;
import com.poshibrido.pharmacy.application.QualityService.AdverseEventView;
import com.poshibrido.pharmacy.application.QualityService.PointView;
import com.poshibrido.pharmacy.application.QualityService.ReadingView;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.organization.application.BusinessSettingsApi;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Informe para la visita de la Secretaría de Salud (Fase 13-6, decisión 287): en un solo documento lo que la inspección
 * pide revisar de un periodo — datos del establecimiento y del director técnico, la planilla de temperatura y humedad
 * (con lo que faltó y lo que salió del rango), vencidos y por vencer, actas de baja, recepciones técnicas, el resumen de
 * la dispensación (antibióticos uno por uno) y los eventos adversos.
 */
@Service
@RequiredArgsConstructor
public class VisitReportService {

    private final QualityService quality;
    private final PharmacyService pharmacy;
    private final LotQueryService lots;
    private final BrandingService branding;
    private final BusinessSettingsApi settings;

    public record Establishment(String businessName, String branchName, String branchAddress, String branchPhone,
                                TechnicalDirector technicalDirector) {
    }

    public record QualitySection(List<PointView> points, List<ReadingView> readings, int expected, int missing,
                                 long outOfRange) {
    }

    public record Disposal(long number, Instant createdAt, String reason, String method, String witness,
                           BigDecimal value) {
    }

    public record Receipt(long number, Instant receivedAt, String supplier, String invoice, BigDecimal total,
                          BigDecimal rejectedTotal, BigDecimal coldChainTemperature, boolean checksConfirmed) {
    }

    public record DispensationSummary(long total, long antibiotics, long controlled, long voided) {
    }

    public record AntibioticRow(Instant at, String saleNumber, String patientName, String patientDocument,
                                String prescriberName, String prescriberLicense, String medicines) {
    }

    public record VisitReport(LocalDate from, LocalDate to, Instant generatedAt, Establishment establishment,
                              QualitySection quality, int alertMonths, List<LotRow> expired, List<LotRow> expiring,
                              List<Disposal> disposals, List<Receipt> receipts, DispensationSummary dispensations,
                              List<AntibioticRow> antibiotics, List<AdverseEventView> adverseEvents) {
    }

    @Transactional(readOnly = true)
    public VisitReport report(UUID requestedBranch, LocalDate from, LocalDate to) {
        UUID branchId = quality.resolveBranch(requestedBranch);
        ZoneId zone = quality.zone();
        LocalDateTime now = LocalDateTime.now(zone);
        LocalDate today = now.toLocalDate();
        LocalDate end = to == null || to.isAfter(today) ? today : to;
        LocalDate start = from == null ? end.withDayOfMonth(1) : from;
        if (end.isBefore(start) || start.plusDays(400).isBefore(end)) {
            throw new BusinessRuleException("Elige un periodo de hasta un año, con la fecha final después de la inicial.");
        }
        Map<String, Object> range = Map.of("b", branchId,
                "f", Timestamp.from(start.atStartOfDay(zone).toInstant()),
                "t", Timestamp.from(end.plusDays(1).atStartOfDay(zone).toInstant()));

        Object[] b = quality.rows("SELECT name, address, phone FROM branches WHERE id = :b", Map.of("b", branchId))
                .getFirst();
        Establishment establishment = new Establishment(branding.header().businessName(), (String) b[0], (String) b[1],
                (String) b[2], pharmacy.technicalDirector());

        // Temperatura y humedad: lo esperado es mañana y tarde de cada punto activo desde el día en que se creó.
        List<PointView> points = quality.points(branchId);
        List<ReadingView> readings = quality.readings(branchId, start, end);
        Set<String> done = new HashSet<>();
        readings.forEach(r -> done.add(r.pointId() + "|" + r.date() + "|" + r.shift()));
        int expected = 0;
        int missing = 0;
        for (Object[] p : quality.rows("SELECT id, created_at FROM quality_points WHERE branch_id = :b AND active",
                Map.of("b", branchId))) {
            LocalDate created = QualityService.instant(p[1]).atZone(zone).toLocalDate();
            for (LocalDate d = start.isBefore(created) ? created : start; !d.isAfter(end); d = d.plusDays(1)) {
                for (String shift : List.of("MORNING", "AFTERNOON")) {
                    if ("AFTERNOON".equals(shift) && d.equals(today) && now.getHour() < QualityService.AFTERNOON_DUE) {
                        continue;
                    }
                    expected++;
                    if (!done.contains(p[0] + "|" + d + "|" + shift)) {
                        missing++;
                    }
                }
            }
        }
        long out = readings.stream().filter(ReadingView::outOfRange).count();

        List<LotRow> expired = lots.lots(branchId, LotStatus.EXPIRED, null, 0, 200).content();
        List<LotRow> expiring = lots.lots(branchId, LotStatus.EXPIRING, null, 0, 200).content();
        int alertMonths = settings.current().expiryAlertMonths();

        List<Disposal> disposals = new ArrayList<>();
        for (Object[] r : quality.rows("""
                SELECT d.number, d.created_at, d.reason, d.disposal_method, d.witness_name,
                       coalesce((SELECT sum(round(l.base_quantity * coalesce(l.unit_cost, 0), 2))
                                 FROM inventory_document_lines l WHERE l.document_id = d.id), 0)
                FROM inventory_documents d
                WHERE d.type = 'DISPOSAL' AND d.branch_id = :b AND d.created_at >= :f AND d.created_at < :t
                ORDER BY d.created_at""", range)) {
            disposals.add(new Disposal(((Number) r[0]).longValue(), QualityService.instant(r[1]), (String) r[2],
                    (String) r[3], (String) r[4], (BigDecimal) r[5]));
        }

        List<Receipt> receipts = new ArrayList<>();
        for (Object[] r : quality.rows("""
                SELECT r.number, r.received_at,
                       coalesce(p.business_name, trim(coalesce(p.first_names, '') || ' ' || coalesce(p.last_names, ''))),
                       r.supplier_invoice, r.total, r.rejected_total, r.cold_chain_temperature, r.checks_confirmed
                FROM purchase_receipts r JOIN parties p ON p.id = r.supplier_id
                WHERE r.branch_id = :b AND r.received_at >= :f AND r.received_at < :t
                ORDER BY r.received_at""", range)) {
            receipts.add(new Receipt(((Number) r[0]).longValue(), QualityService.instant(r[1]), (String) r[2],
                    (String) r[3], (BigDecimal) r[4], (BigDecimal) r[5], (BigDecimal) r[6], (Boolean) r[7]));
        }

        Object[] c = quality.rows("""
                SELECT count(*), count(*) FILTER (WHERE d.antibiotic), count(*) FILTER (WHERE d.controlled),
                       count(*) FILTER (WHERE s.status = 'VOIDED')
                FROM sale_dispensations d JOIN sales s ON s.id = d.sale_id
                WHERE d.branch_id = :b AND d.dispensed_at >= :f AND d.dispensed_at < :t""", range).getFirst();
        DispensationSummary summary = new DispensationSummary(((Number) c[0]).longValue(), ((Number) c[1]).longValue(),
                ((Number) c[2]).longValue(), ((Number) c[3]).longValue());

        List<AntibioticRow> antibiotics = new ArrayList<>();
        for (Object[] r : quality.rows("""
                SELECT d.dispensed_at, s.prefix || '-' || s.number, d.patient_name, d.patient_document, d.prescriber_name,
                       d.prescriber_license,
                       (SELECT string_agg(i.name || ' x' || trim(to_char(i.quantity, 'FM999990.####')), '; '
                               ORDER BY i.line_no)
                        FROM sale_dispensation_lines dl JOIN sale_items i ON i.sale_id = dl.sale_id AND i.line_no = dl.line_no
                        WHERE dl.sale_id = d.sale_id AND dl.antibiotic)
                FROM sale_dispensations d JOIN sales s ON s.id = d.sale_id
                WHERE d.branch_id = :b AND d.antibiotic AND s.status <> 'VOIDED'
                  AND d.dispensed_at >= :f AND d.dispensed_at < :t
                ORDER BY d.dispensed_at LIMIT 500""", range)) {
            antibiotics.add(new AntibioticRow(QualityService.instant(r[0]), (String) r[1], (String) r[2], (String) r[3],
                    (String) r[4], (String) r[5], (String) r[6]));
        }

        List<AdverseEventView> events = quality.adverseEvents(branchId, start, end);
        return new VisitReport(start, end, Instant.now(), establishment,
                new QualitySection(points, readings, expected, missing, out), alertMonths, expired, expiring,
                disposals, receipts, summary, antibiotics, events);
    }
}
