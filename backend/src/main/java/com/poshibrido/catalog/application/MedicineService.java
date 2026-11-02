package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.domain.ProductMedicine;
import com.poshibrido.catalog.infrastructure.ProductMedicineRepository;
import com.poshibrido.catalog.infrastructure.ProductRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.security.CurrentActor;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Ficha del medicamento de cada producto (Fase 13-1, decisión 279). Reglas:
 * <ul>
 *   <li>Medicamento y fitoterapéutico siempre tienen condición de venta (libre, bajo fórmula, control especial o
 *       monopolio del Estado); los demás tipos no la llevan.</li>
 *   <li>Un ATC J01 (antibacterianos de uso sistémico) es antibiótico aunque no lo marquen; un antibiótico nunca es de
 *       venta libre.</li>
 *   <li>Venta por unidad solo si se marca, y nunca en antibióticos ni en control especial o monopolio (Decreto 677 de
 *       1995 art. 70: el medicamento se entrega en su envase aprobado).</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class MedicineService {

    public static final Set<String> KINDS =
            Set.of("MEDICINE", "PHYTOTHERAPEUTIC", "MEDICAL_DEVICE", "COSMETIC", "SUPPLEMENT", "OTHER");
    public static final Set<String> CONDITIONS = Set.of("OTC", "PRESCRIPTION", "CONTROLLED", "STATE_MONOPOLY");
    private static final Set<String> WITH_CONDITION = Set.of("MEDICINE", "PHYTOTHERAPEUTIC");
    private static final Set<String> RESTRICTED = Set.of("CONTROLLED", "STATE_MONOPOLY");
    private static final Pattern CUM = Pattern.compile("^\\d{1,15}-\\d{1,6}$");
    private static final Pattern ATC = Pattern.compile("^[A-Z]\\d{2}([A-Z]([A-Z](\\d{2})?)?)?$");

    private final ProductMedicineRepository medicines;
    private final ProductRepository products;
    private final AuditLogger audit;

    /** Lo que se envía para guardar la ficha. */
    public record MedicineInput(String kind, String sanitaryRegistration, String cum, String activeIngredients,
                                String dosageForm, String route, String atc, String holder, String saleCondition,
                                boolean antibiotic, boolean coldChain, boolean unitSale) {
    }

    public record MedicineView(UUID productId, String kind, String sanitaryRegistration, String cum,
                               String activeIngredients, String dosageForm, String route, String atc, String holder,
                               String saleCondition, boolean antibiotic, boolean coldChain, boolean unitSale) {
    }

    @Transactional(readOnly = true)
    public Optional<MedicineView> get(UUID productId) {
        requireProduct(productId);
        return medicines.findById(productId).map(MedicineService::view);
    }

    @Transactional
    public MedicineView save(UUID productId, MedicineInput input) {
        requireProduct(productId);
        ProductMedicine.Data data = validate(input);
        UUID actor = CurrentActor.requireUserId();
        Optional<ProductMedicine> existing = medicines.findById(productId);
        Map<String, Object> before = existing.map(m -> snapshot(view(m))).orElse(null);
        ProductMedicine medicine = existing.orElseGet(() -> ProductMedicine.create(productId, actor));
        medicine.apply(data, actor);
        medicines.save(medicine);
        MedicineView view = view(medicine);
        audit.log("PRODUCT_MEDICINE_SAVED", "product", productId, before, snapshot(view));
        return view;
    }

    /** Resumen para la lista de productos y el POS (una consulta para toda la página). */
    @Transactional(readOnly = true)
    public Map<UUID, ProductView.MedicineBadge> badges(Collection<UUID> productIds) {
        Map<UUID, ProductView.MedicineBadge> result = new HashMap<>();
        if (!productIds.isEmpty()) {
            medicines.findAllById(productIds).forEach(m -> result.put(m.getProductId(), badge(m)));
        }
        return result;
    }

    static ProductView.MedicineBadge badge(ProductMedicine m) {
        return new ProductView.MedicineBadge(m.getKind(), m.getSaleCondition(), m.getActiveIngredients(),
                m.isAntibiotic(), m.isColdChain(), m.isUnitSale());
    }

    static ProductMedicine.Data validate(MedicineInput in) {
        if (in == null || in.kind() == null || !KINDS.contains(in.kind())) {
            throw new BusinessRuleException("Elige el tipo de producto.");
        }
        String kind = in.kind();
        String condition = trim(in.saleCondition());
        if (WITH_CONDITION.contains(kind)) {
            if (condition == null || !CONDITIONS.contains(condition)) {
                throw new BusinessRuleException("Elige la condición de venta: libre, bajo fórmula médica, control especial "
                        + "o monopolio del Estado.");
            }
        } else {
            condition = null;
        }
        String cum = trim(in.cum());
        if (cum != null && !CUM.matcher(cum).matches()) {
            throw new BusinessRuleException("El CUM es el expediente y el consecutivo separados por guion (p. ej. 19943544-1).");
        }
        String atc = trim(in.atc());
        if (atc != null) {
            atc = atc.toUpperCase(Locale.ROOT);
            if (!ATC.matcher(atc).matches()) {
                throw new BusinessRuleException("El código ATC no es válido (p. ej. J01CA04).");
            }
        }
        boolean medicine = "MEDICINE".equals(kind);
        boolean antibiotic = medicine && (in.antibiotic() || (atc != null && atc.startsWith("J01")));
        if (in.antibiotic() && !medicine) {
            throw new BusinessRuleException("Solo un medicamento se marca como antibiótico.");
        }
        if (antibiotic && "OTC".equals(condition)) {
            throw new BusinessRuleException("Un antibiótico no es de venta libre: se vende solo con fórmula médica.");
        }
        if (in.unitSale() && (antibiotic || RESTRICTED.contains(condition))) {
            throw new BusinessRuleException(antibiotic
                    ? "Los antibióticos no se venden por unidad: se entregan en su envase completo."
                    : "Los medicamentos de control especial no se venden por unidad.");
        }
        return new ProductMedicine.Data(kind, limit(in.sanitaryRegistration(), 80, "registro sanitario"), cum,
                limit(in.activeIngredients(), 1000, "principio activo"), limit(in.dosageForm(), 200, "forma farmacéutica"),
                limit(in.route(), 120, "vía de administración"), atc, limit(in.holder(), 300, "titular"), condition,
                antibiotic, in.coldChain(), in.unitSale());
    }

    private void requireProduct(UUID productId) {
        if (!products.existsById(productId)) {
            throw new NotFoundException("Producto no encontrado.");
        }
    }

    private static MedicineView view(ProductMedicine m) {
        return new MedicineView(m.getProductId(), m.getKind(), m.getSanitaryRegistration(), m.getCum(),
                m.getActiveIngredients(), m.getDosageForm(), m.getRoute(), m.getAtc(), m.getHolder(),
                m.getSaleCondition(), m.isAntibiotic(), m.isColdChain(), m.isUnitSale());
    }

    private static Map<String, Object> snapshot(MedicineView v) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", v.kind());
        data.put("saleCondition", v.saleCondition());
        data.put("sanitaryRegistration", v.sanitaryRegistration());
        data.put("cum", v.cum());
        data.put("activeIngredients", v.activeIngredients());
        data.put("antibiotic", v.antibiotic());
        data.put("coldChain", v.coldChain());
        data.put("unitSale", v.unitSale());
        return data;
    }

    private static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String limit(String value, int max, String field) {
        String v = trim(value);
        if (v != null && v.length() > max) {
            throw new BusinessRuleException("El campo " + field + " admite hasta " + max + " caracteres.");
        }
        return v;
    }
}
