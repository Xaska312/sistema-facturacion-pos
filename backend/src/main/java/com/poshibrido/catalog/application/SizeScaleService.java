package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.domain.SizeScale;
import com.poshibrido.catalog.infrastructure.ProductRepository;
import com.poshibrido.catalog.infrastructure.SizeScaleRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Escalas de tallas (fase 8d): las sembradas (calzado Colombia, EU, US, niño, ropa…) y las que cree cada negocio. Las
 * tallas se guardan en orden con una equivalencia opcional en texto libre (p. ej. "EU 39"), que edita el negocio
 * porque cambia según la marca. Una talla que ya usa alguna variante no se puede quitar.
 */
@Service
@RequiredArgsConstructor
public class SizeScaleService {

    static final int MAX_SIZES = 40;
    private static final Pattern LABEL = Pattern.compile("^(?=.*[A-Za-z0-9])[A-Za-z0-9.,/ -]{1,10}$");

    private final SizeScaleRepository scales;
    private final ProductRepository products;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    public record Size(String label, String equivalent) {
    }

    public record SizeScaleView(UUID id, String code, String name, boolean active, List<Size> sizes) {
    }

    @Transactional(readOnly = true)
    public List<SizeScaleView> list() {
        Map<UUID, List<Size>> sizes = allSizes();
        return scales.findAll().stream()
                .sorted(Comparator.comparingInt(SizeScale::getSortOrder).thenComparing(SizeScale::getName))
                .map(s -> view(s, sizes.getOrDefault(s.getId(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public SizeScaleView get(UUID id) {
        SizeScale scale = find(id);
        return view(scale, sizesOf(id));
    }

    @Transactional
    public SizeScaleView create(String name, List<Size> sizes) {
        String cleanName = requireName(name);
        String code = uniqueCode(cleanName);
        SizeScale scale = scales.save(SizeScale.create(code, cleanName, 100));
        List<Size> clean = validSizes(sizes);
        writeSizes(scale.getId(), clean);
        audit.log("SIZE_SCALE_CREATED", "size_scale", scale.getId(), null, snapshot(cleanName, clean));
        return view(scale, clean);
    }

    /** Renombra, activa o desactiva y reemplaza las tallas (en el orden recibido). */
    @Transactional
    public SizeScaleView update(UUID id, String name, boolean active, List<Size> sizes) {
        SizeScale scale = find(id);
        List<Size> before = sizesOf(id);
        List<Size> clean = validSizes(sizes);
        Set<String> wanted = new HashSet<>();
        clean.forEach(s -> wanted.add(s.label()));
        for (String used : products.sizesInUse(id)) {
            if (!wanted.contains(used)) {
                throw new BusinessRuleException("La talla " + used + " la usan productos: no se puede quitar.");
            }
        }
        scale.rename(requireName(name));
        scale.setActive(active);
        writeSizes(id, clean);
        audit.log("SIZE_SCALE_UPDATED", "size_scale", id, snapshot(scale.getName(), before),
                snapshot(scale.getName(), clean));
        return view(scale, clean);
    }

    /** Tallas de la escala en orden; 404 si no existe. */
    @Transactional(readOnly = true)
    public List<Size> sizesOf(UUID scaleId) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                SELECT label, equivalent FROM size_scale_sizes WHERE scale_id = ?1 ORDER BY position""")
                .setParameter(1, scaleId).getResultList();
        return rows.stream().map(r -> new Size((String) r[0], (String) r[1])).toList();
    }

    SizeScale find(UUID id) {
        return scales.findById(id).orElseThrow(() -> new NotFoundException("Escala de tallas no encontrada."));
    }

    // ------------------------------------------------------------------ apoyo

    private Map<UUID, List<Size>> allSizes() {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                SELECT scale_id, label, equivalent FROM size_scale_sizes ORDER BY scale_id, position""")
                .getResultList();
        Map<UUID, List<Size>> byScale = new LinkedHashMap<>();
        for (Object[] r : rows) {
            UUID scaleId = r[0] instanceof UUID u ? u : UUID.fromString(r[0].toString());
            byScale.computeIfAbsent(scaleId, k -> new ArrayList<>()).add(new Size((String) r[1], (String) r[2]));
        }
        return byScale;
    }

    private void writeSizes(UUID scaleId, List<Size> sizes) {
        em.flush();
        em.createNativeQuery("DELETE FROM size_scale_sizes WHERE scale_id = ?1").setParameter(1, scaleId)
                .executeUpdate();
        int position = 0;
        for (Size size : sizes) {
            em.createNativeQuery("""
                    INSERT INTO size_scale_sizes (scale_id, position, label, equivalent) VALUES (?1, ?2, ?3, ?4)""")
                    .setParameter(1, scaleId).setParameter(2, ++position).setParameter(3, size.label())
                    .setParameter(4, size.equivalent()).executeUpdate();
        }
    }

    private static List<Size> validSizes(List<Size> sizes) {
        if (sizes == null || sizes.isEmpty()) {
            throw new BusinessRuleException("Agrega al menos una talla.");
        }
        if (sizes.size() > MAX_SIZES) {
            throw new BusinessRuleException("Una escala tiene como máximo " + MAX_SIZES + " tallas.");
        }
        Set<String> seen = new HashSet<>();
        List<Size> clean = new ArrayList<>();
        for (Size size : sizes) {
            String label = size == null || size.label() == null ? "" : size.label().trim().toUpperCase(Locale.ROOT);
            if (!LABEL.matcher(label).matches()) {
                throw new BusinessRuleException("Talla inválida: '" + label
                        + "'. Usa hasta 10 letras, números, espacios, '.', ',', '/' o '-' (con al menos una letra o número).");
            }
            if (!seen.add(label)) {
                throw new BusinessRuleException("La talla " + label + " está repetida.");
            }
            String equivalent = size.equivalent() == null || size.equivalent().isBlank() ? null
                    : size.equivalent().trim();
            if (equivalent != null && equivalent.length() > 40) {
                throw new BusinessRuleException("La equivalencia de la talla " + label + " es muy larga (máximo 40).");
            }
            clean.add(new Size(label, equivalent));
        }
        return clean;
    }

    private static String requireName(String name) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty() || clean.length() > 60) {
            throw new BusinessRuleException("El nombre de la escala es obligatorio (máximo 60 caracteres).");
        }
        return clean;
    }

    private String uniqueCode(String name) {
        String base = CatalogVariants.token(name, 16);
        if (base.isEmpty()) {
            base = "ESCALA";
        }
        String code = base;
        for (int i = 2; scales.existsByCode(code); i++) {
            if (i > 99) {
                throw new ConflictException("No se pudo generar un código para la escala. Usa otro nombre.");
            }
            code = base + "_" + i;
        }
        return code;
    }

    private static SizeScaleView view(SizeScale s, List<Size> sizes) {
        return new SizeScaleView(s.getId(), s.getCode(), s.getName(), s.isActive(), sizes);
    }

    private static Map<String, Object> snapshot(String name, List<Size> sizes) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", name);
        data.put("sizes", sizes.stream().map(Size::label).toList());
        return data;
    }
}
