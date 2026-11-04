package com.poshibrido.pharmacy.application;

import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.domain.BusinessModule;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Reglas de la dispensación al vender (Fase 13-4, decisión 282), con el módulo Medicamentos:
 * <ul>
 *   <li>Un medicamento bajo fórmula, de control especial o de monopolio del Estado solo lo vende quien tiene
 *       {@code pharmacy:dispense}, y confirmando que vio la fórmula (Decreto 780 de 2016, art. 2.5.3.10.18).</li>
 *   <li>En antibióticos y control especial además se anotan quién firmó la fórmula, su fecha y el paciente.</li>
 *   <li>Solo desde Vender (no en pedidos, cotizaciones ni cuentas de mesa): ahí se pide la confirmación.</li>
 * </ul>
 * Sin el módulo encendido no aplica (la ficha queda guardada pero no se usa).
 */
@Component
public class DispensationRules {

    public static final String DISPENSE = "pharmacy:dispense";
    private static final Set<String> RESTRICTED = Set.of("PRESCRIPTION", "CONTROLLED", "STATE_MONOPOLY");
    private static final Set<String> STRICT = Set.of("CONTROLLED", "STATE_MONOPOLY");
    private static final Pattern DOCUMENT = Pattern.compile("^[A-Za-z0-9-]{3,20}$");

    @PersistenceContext
    private EntityManager em;

    /** Lo que envía el POS al vender algo bajo fórmula. */
    public record Dispensation(boolean prescriptionSeen, String prescriberName, String prescriberLicense,
                               LocalDate prescriptionDate, String patientDocument, String patientName) {
    }

    /** Una línea de la venta que se dispensa. */
    public record DispensedLine(int lineNo, UUID productId, String productName, String saleCondition,
                                boolean antibiotic) {
    }

    /** Lo que hay que guardar con la venta (nulo si no hay nada que dispensar). */
    public record Checked(Dispensation data, List<DispensedLine> lines, boolean antibiotic, boolean controlled) {
    }

    /**
     * Valida la venta. {@code lines}: número de línea → producto (con su nombre). {@code fromPos}: la venta viene de
     * Vender. Devuelve lo que hay que guardar, o nulo si la venta no lleva nada bajo fórmula.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Checked check(Map<Integer, UUID> lines, Map<UUID, String> names, Dispensation d, boolean fromPos,
                         LocalDate today) {
        if (!CurrentActor.permissions().contains(BusinessModule.MEDICINES.authority()) || lines.isEmpty()) {
            return null;
        }
        Map<UUID, Object[]> sheets = sheets(lines.values());
        List<DispensedLine> restricted = new ArrayList<>();
        lines.forEach((lineNo, productId) -> {
            Object[] s = sheets.get(productId);
            if (s != null && s[0] != null && RESTRICTED.contains((String) s[0])) {
                restricted.add(new DispensedLine(lineNo, productId, names.get(productId), (String) s[0],
                        Boolean.TRUE.equals(s[1])));
            }
        });
        if (restricted.isEmpty()) {
            return null;
        }
        String first = restricted.getFirst().productName();
        if (!fromPos) {
            throw new BusinessRuleException(first + " es de venta bajo fórmula médica: véndelo desde Vender, donde se "
                    + "confirma la fórmula.");
        }
        if (!CurrentActor.permissions().contains(DISPENSE)) {
            throw new ForbiddenException(first + " se vende con fórmula médica y tu usuario no puede dispensar. "
                    + "Llama al director técnico o al auxiliar de farmacia.");
        }
        if (d == null || !d.prescriptionSeen()) {
            throw new BusinessRuleException("Confirma que viste la fórmula médica de " + first + ".");
        }
        boolean antibiotic = restricted.stream().anyMatch(DispensedLine::antibiotic);
        boolean controlled = restricted.stream().anyMatch(l -> STRICT.contains(l.saleCondition()));
        Dispensation data = d;
        if (antibiotic || controlled) {
            String what = antibiotic ? "antibiótico" : "medicamento de control especial";
            String prescriber = text(d.prescriberName(), 160);
            String patient = text(d.patientName(), 160);
            String document = d.patientDocument() == null ? null : d.patientDocument().trim().replace(".", "");
            if (prescriber == null) {
                throw new BusinessRuleException("Para dispensar un " + what + " escribe quién firmó la fórmula.");
            }
            if (d.prescriptionDate() == null || d.prescriptionDate().isAfter(today)) {
                throw new BusinessRuleException("Escribe la fecha de la fórmula (no puede ser futura).");
            }
            if (document == null || !DOCUMENT.matcher(document).matches()) {
                throw new BusinessRuleException("Escribe el documento del paciente (de 3 a 20 letras o números).");
            }
            if (patient == null) {
                throw new BusinessRuleException("Escribe el nombre del paciente.");
            }
            data = new Dispensation(true, prescriber, text(d.prescriberLicense(), 40), d.prescriptionDate(),
                    document.toUpperCase(java.util.Locale.ROOT), patient);
        } else {
            data = new Dispensation(true, null, null, null, null, null);
        }
        return new Checked(data, restricted, antibiotic, controlled);
    }

    /** Guarda la dispensación junto con la venta. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID saleId, UUID branchId, UUID actor, Checked c) {
        Dispensation d = c.data();
        em.createNativeQuery("""
                INSERT INTO sale_dispensations (sale_id, branch_id, prescription_seen, prescriber_name,
                    prescriber_license, prescription_date, patient_document, patient_name, antibiotic, controlled,
                    dispensed_by, dispensed_at)
                VALUES (?1, ?2, TRUE, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)""")
                .setParameter(1, saleId).setParameter(2, branchId).setParameter(3, d.prescriberName())
                .setParameter(4, d.prescriberLicense())
                .setParameter(5, d.prescriptionDate() == null ? null : Date.valueOf(d.prescriptionDate()))
                .setParameter(6, d.patientDocument()).setParameter(7, d.patientName()).setParameter(8, c.antibiotic())
                .setParameter(9, c.controlled()).setParameter(10, actor).setParameter(11, Timestamp.from(Instant.now()))
                .executeUpdate();
        for (DispensedLine l : c.lines()) {
            em.createNativeQuery("""
                    INSERT INTO sale_dispensation_lines (sale_id, line_no, product_id, sale_condition, antibiotic)
                    VALUES (?1, ?2, ?3, ?4, ?5)""")
                    .setParameter(1, saleId).setParameter(2, l.lineNo()).setParameter(3, l.productId())
                    .setParameter(4, l.saleCondition()).setParameter(5, l.antibiotic()).executeUpdate();
        }
    }

    private Map<UUID, Object[]> sheets(Collection<UUID> productIds) {
        Map<UUID, Object[]> result = new HashMap<>();
        for (Object o : em.createNativeQuery(
                "SELECT product_id, sale_condition, antibiotic FROM product_medicines WHERE product_id IN (:ids)")
                .setParameter("ids", Set.copyOf(productIds)).getResultList()) {
            Object[] r = (Object[]) o;
            result.put((UUID) r[0], new Object[]{r[1], r[2]});
        }
        return result;
    }

    private static String text(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim().replaceAll("\\s+", " ");
        if (v.length() > max) {
            throw new BusinessRuleException("El dato \"" + v.substring(0, 20) + "…\" admite hasta " + max + " caracteres.");
        }
        return v;
    }
}
