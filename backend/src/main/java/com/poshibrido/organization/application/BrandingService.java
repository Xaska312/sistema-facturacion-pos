package com.poshibrido.organization.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantInfo;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Marca del negocio (fase 8c): un color de una paleta cerrada (el contraste de cada una está revisado en claro y
 * oscuro) y un logo pequeño para el encabezado y el tiquete. El logo se guarda en la base del negocio (lo reduce el
 * navegador a pocos KB) y se entrega como data URL: así lo ve cualquier pantalla sin pedir la imagen con el token.
 */
@Service
@RequiredArgsConstructor
public class BrandingService {

    public static final Set<String> COLORS =
            Set.of("turquesa", "azul", "indigo", "violeta", "rosa", "naranja", "verde", "grafito");
    /** 150 KB: un logo de 320 px en PNG pesa 10–60 KB. */
    static final int MAX_LOGO_BYTES = 150 * 1024;

    private final AuditLogger audit;
    private final TenantApi tenants;

    @PersistenceContext
    private EntityManager em;

    /** {@code logo}: data URL ({@code data:image/png;base64,…}) o null. */
    public record Branding(String color, String logo, Instant updatedAt) {
    }

    /**
     * Encabezado de los documentos para el cliente (pedido, cotización): nombre comercial y nombre, dirección y teléfono
     * de la sede activa más antigua (la principal). Decisión 261.
     */
    public record BusinessHeader(String businessName, String branchName, String branchAddress, String branchPhone) {
    }

    @Transactional(readOnly = true)
    public BusinessHeader header() {
        String businessName = tenants.findInfo(CurrentTenant.require().id()).map(TenantInfo::tradeName).orElse("");
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT name, address, phone FROM branches WHERE active ORDER BY created_at, code LIMIT 1")
                .getResultList();
        Object[] b = rows.isEmpty() ? new Object[3] : rows.getFirst();
        return new BusinessHeader(businessName, (String) b[0], (String) b[1], (String) b[2]);
    }

    @Transactional(readOnly = true)
    public Branding current() {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT brand_color, logo, logo_type, updated_at FROM business_branding WHERE id = 1").getResultList();
        if (rows.isEmpty()) {
            return new Branding("indigo", null, null);
        }
        Object[] r = rows.getFirst();
        String logo = r[1] == null ? null
                : "data:" + r[2] + ";base64," + Base64.getEncoder().encodeToString((byte[]) r[1]);
        return new Branding((String) r[0], logo, toInstant(r[3]));
    }

    @Transactional
    public Branding setColor(String color) {
        String clean = color == null ? "" : color.trim().toLowerCase(Locale.ROOT);
        if (!COLORS.contains(clean)) {
            throw new BusinessRuleException("Elige un color de la paleta.");
        }
        String before = current().color();
        update("brand_color = ?1", clean);
        audit.log("BRANDING_UPDATED", "business_settings", null, Map.of("color", before), Map.of("color", clean));
        return current();
    }

    /** Recibe el logo como data URL; el tipo se comprueba por los primeros bytes, no por lo que diga el texto. */
    @Transactional
    public Branding setLogo(String dataUrl) {
        byte[] bytes = decode(dataUrl);
        if (bytes.length == 0 || bytes.length > MAX_LOGO_BYTES) {
            throw new BusinessRuleException("El logo debe pesar como máximo 150 KB.");
        }
        String type = imageType(bytes);
        if (type == null) {
            throw new BusinessRuleException("El logo debe ser una imagen PNG, JPG o WebP.");
        }
        update("logo = ?1, logo_type = ?2", bytes, type);
        audit.log("BRANDING_UPDATED", "business_settings", null, null, logoInfo(type, bytes.length));
        return current();
    }

    @Transactional
    public Branding removeLogo() {
        update("logo = NULL, logo_type = NULL");
        audit.log("BRANDING_UPDATED", "business_settings", null, null, Map.of("logo", "sin logo"));
        return current();
    }

    // ------------------------------------------------------------------ apoyo

    /**
     * Actualiza la única fila con quién y cuándo. Sin usuario (no pasa en una petición) no se escribe updated_by: un
     * parámetro nulo no tiene tipo para PostgreSQL.
     */
    private void update(String assignments, Object... values) {
        UUID actor = CurrentActor.userId().orElse(null);
        String sql = "UPDATE business_branding SET " + assignments + ", updated_at = now()"
                + (actor == null ? "" : ", updated_by = ?" + (values.length + 1)) + " WHERE id = 1";
        var query = em.createNativeQuery(sql);
        for (int i = 0; i < values.length; i++) {
            query.setParameter(i + 1, values[i]);
        }
        if (actor != null) {
            query.setParameter(values.length + 1, actor);
        }
        query.executeUpdate();
    }

    private static byte[] decode(String dataUrl) {
        String value = dataUrl == null ? "" : dataUrl.trim();
        int comma = value.indexOf(',');
        if (!value.startsWith("data:image/") || comma < 0 || !value.substring(0, comma).endsWith(";base64")) {
            throw new BusinessRuleException("El logo debe ser una imagen PNG, JPG o WebP.");
        }
        try {
            return Base64.getDecoder().decode(value.substring(comma + 1));
        } catch (IllegalArgumentException ex) {
            throw new BusinessRuleException("La imagen del logo está dañada. Vuelve a elegirla.");
        }
    }

    /** PNG, JPEG o WebP por su firma; cualquier otra cosa (SVG, HTML…) se rechaza. */
    static String imageType(byte[] b) {
        if (b.length >= 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return "image/png";
        }
        if (b.length >= 3 && (b[0] & 0xff) == 0xFF && (b[1] & 0xff) == 0xD8 && (b[2] & 0xff) == 0xFF) {
            return "image/jpeg";
        }
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "image/webp";
        }
        return null;
    }

    private static Map<String, Object> logoInfo(String type, int size) {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("logo", type);
        info.put("bytes", size);
        return info;
    }

    private static Instant toInstant(Object value) {
        if (value instanceof Instant i) {
            return i;
        }
        if (value instanceof OffsetDateTime o) {
            return o.toInstant();
        }
        if (value instanceof java.sql.Timestamp t) {
            return t.toInstant();
        }
        return null;
    }
}
