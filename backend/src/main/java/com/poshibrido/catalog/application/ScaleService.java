package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.application.ScaleLabels.Format;
import com.poshibrido.catalog.application.ScaleLabels.Kind;
import com.poshibrido.catalog.application.ScaleLabels.Label;
import com.poshibrido.catalog.domain.Product;
import com.poshibrido.catalog.domain.Unit;
import com.poshibrido.catalog.infrastructure.ProductRepository;
import com.poshibrido.catalog.infrastructure.UnitRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Báscula etiquetadora (fase 8e): el formato de sus etiquetas y qué producto es cada PLU. El lector del POS manda el
 * código de la etiqueta; si coincide con el formato, se busca el PLU y la cantidad sale del peso o del precio.
 */
@Service
@RequiredArgsConstructor
public class ScaleService {

    /** Unidades de peso que maneja una báscula (los decimales de la etiqueta son de kilo o libra). */
    private static final java.util.Set<String> WEIGHT_UNITS = java.util.Set.of("KG", "LB");

    private final ProductRepository products;
    private final UnitRepository units;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    public record PluView(String plu, UUID productId, String sku, String name, String unitCode) {
    }

    @Transactional(readOnly = true)
    public Format format() {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                SELECT enabled, prefix, plu_digits, value_kind, value_decimals FROM scale_settings WHERE id = 1""")
                .getResultList();
        if (rows.isEmpty()) {
            return new Format(false, "20", 5, Kind.WEIGHT, 3);
        }
        Object[] r = rows.getFirst();
        return new Format((Boolean) r[0], (String) r[1], ((Number) r[2]).intValue(), Kind.valueOf((String) r[3]),
                ((Number) r[4]).intValue());
    }

    @Transactional
    public Format updateFormat(Format requested) {
        if (requested.prefix() == null || !requested.prefix().matches("^2[0-8]?$")) {
            throw new BusinessRuleException("El prefijo es 2 o va de 20 a 28 (29 es el de los códigos internos).");
        }
        if (requested.pluDigits() < 3 || requested.pluDigits() > 6) {
            throw new BusinessRuleException("El PLU tiene de 3 a 6 dígitos.");
        }
        int valueDigits = requested.valueDigits();
        if (valueDigits < 4 || valueDigits > 7) {
            throw new BusinessRuleException("Con ese prefijo y ese PLU, al valor le quedan " + valueDigits
                    + " dígitos: deben ser de 4 a 7.");
        }
        int decimals = requested.kind() == Kind.PRICE ? 0 : requested.decimals();
        if (decimals < 0 || decimals > 3) {
            throw new BusinessRuleException("El peso lleva de 0 a 3 decimales.");
        }
        Format before = format();
        em.createNativeQuery("""
                UPDATE scale_settings SET enabled = ?1, prefix = ?2, plu_digits = ?3, value_kind = ?4,
                    value_decimals = ?5, updated_at = now() WHERE id = 1""")
                .setParameter(1, requested.enabled()).setParameter(2, requested.prefix())
                .setParameter(3, requested.pluDigits()).setParameter(4, requested.kind().name())
                .setParameter(5, decimals).executeUpdate();
        Format after = format();
        audit.log("SCALE_SETTINGS_UPDATED", "business_settings", null, snapshot(before), snapshot(after));
        return after;
    }

    @Transactional(readOnly = true)
    public List<PluView> plus() {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                SELECT s.plu, p.id, p.sku, p.name, u.code
                FROM scale_plus s JOIN products p ON p.id = s.product_id LEFT JOIN units u ON u.id = p.base_unit_id
                ORDER BY length(s.plu), s.plu""").getResultList();
        return rows.stream().map(r -> new PluView((String) r[0], r[1] instanceof UUID u ? u : UUID.fromString(
                r[1].toString()), (String) r[2], (String) r[3], (String) r[4])).toList();
    }

    /** Asigna (o cambia) el producto de un PLU. El producto debe venderse en una unidad con decimales (KG, LB…). */
    @Transactional
    public PluView assign(String rawPlu, UUID productId) {
        String plu = normalize(rawPlu);
        Product product = products.findById(productId)
                .orElseThrow(() -> new NotFoundException("Producto no encontrado."));
        Unit unit = units.findById(product.getBaseUnitId()).orElse(null);
        // La báscula pesa en kilos (o libras): una etiqueta de 0,750 kg no puede volverse 0,750 g.
        if (unit == null || !WEIGHT_UNITS.contains(unit.getCode())) {
            throw new BusinessRuleException("El producto " + product.getName()
                    + " no se vende por peso: para la báscula su unidad base debe ser KG o LB.");
        }
        Optional<String> other = pluOf(productId).filter(existing -> !existing.equals(plu));
        if (other.isPresent()) {
            throw new ConflictException("El producto " + product.getName() + " ya tiene el PLU " + other.get() + ".");
        }
        @SuppressWarnings("unchecked")
        List<Object> owner = em.createNativeQuery("SELECT product_id FROM scale_plus WHERE plu = ?1 FOR UPDATE")
                .setParameter(1, plu).getResultList();
        if (!owner.isEmpty()) {
            if (owner.getFirst().toString().equals(productId.toString())) {
                return new PluView(plu, productId, product.getSku(), product.getName(), unit.getCode());
            }
            throw new ConflictException("El PLU " + plu + " ya es de otro producto: quítalo primero.");
        }
        em.createNativeQuery("INSERT INTO scale_plus (plu, product_id) VALUES (?1, ?2)")
                .setParameter(1, plu).setParameter(2, productId).executeUpdate();
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("plu", plu);
        after.put("sku", product.getSku());
        audit.log("SCALE_PLU_ASSIGNED", "product", productId, null, after);
        return new PluView(plu, productId, product.getSku(), product.getName(), unit.getCode());
    }

    @Transactional
    public void remove(String rawPlu) {
        String plu = normalize(rawPlu);
        @SuppressWarnings("unchecked")
        List<Object> removed = em.createNativeQuery("DELETE FROM scale_plus WHERE plu = ?1 RETURNING product_id")
                .setParameter(1, plu).getResultList();
        if (removed.isEmpty()) {
            throw new NotFoundException("El PLU " + plu + " no está asignado.");
        }
        audit.log("SCALE_PLU_REMOVED", "product", removed.getFirst(), Map.of("plu", plu), null);
    }

    /** Etiqueta de báscula leída: el producto de su PLU y el valor (peso o precio). Vacío si no es una etiqueta. */
    @Transactional(readOnly = true)
    public Optional<ScaleHit> resolve(String code) {
        Format format = format();
        Optional<Label> label = ScaleLabels.parse(code, format);
        if (label.isEmpty()) {
            return Optional.empty();
        }
        @SuppressWarnings("unchecked")
        List<Object> ids = em.createNativeQuery("SELECT product_id FROM scale_plus WHERE plu = ?1")
                .setParameter(1, label.get().plu()).getResultList();
        if (ids.isEmpty()) {
            return Optional.of(new ScaleHit(label.get().plu(), null, format.kind(), label.get().value()));
        }
        Object id = ids.getFirst();
        return Optional.of(new ScaleHit(label.get().plu(), id instanceof UUID u ? u : UUID.fromString(id.toString()),
                format.kind(), label.get().value()));
    }

    /** {@code productId} nulo = el PLU no está asignado. */
    public record ScaleHit(String plu, UUID productId, Kind kind, java.math.BigDecimal value) {
    }

    private Optional<String> pluOf(UUID productId) {
        @SuppressWarnings("unchecked")
        List<Object> rows = em.createNativeQuery("SELECT plu FROM scale_plus WHERE product_id = ?1")
                .setParameter(1, productId).getResultList();
        return rows.stream().findFirst().map(Object::toString);
    }

    private static String normalize(String raw) {
        String digits = raw == null ? "" : raw.trim();
        if (!digits.matches("^\\d{1,6}$")) {
            throw new BusinessRuleException("El PLU son de 1 a 6 dígitos.");
        }
        String plu = ScaleLabels.stripZeros(digits);
        if (plu.isEmpty()) {
            throw new BusinessRuleException("El PLU no puede ser cero.");
        }
        return plu;
    }

    private static Map<String, Object> snapshot(Format f) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("enabled", f.enabled());
        map.put("prefix", f.prefix());
        map.put("pluDigits", f.pluDigits());
        map.put("kind", f.kind().name());
        map.put("decimals", f.decimals());
        return map;
    }
}
