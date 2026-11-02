package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Catálogo compartido del Código Único de Medicamentos (CUM) del INVIMA (Fase 13-1, decisión 279), en
 * {@code platform.cum_catalog}. El administrador de plataforma lo carga desde el CSV de datos.gov.co: la consola lee el
 * archivo (~75 MB), deja una fila por presentación activa que no es muestra médica (~39 mil) y la envía en tandas
 * ({@link #start}, {@link #addRows}, {@link #finish}); al terminar se quitan las presentaciones que ya no vinieron. Los
 * negocios con el módulo Medicamentos lo consultan al crear un producto ({@link #search}).
 */
@Service
@RequiredArgsConstructor
public class CumCatalogService {

    public static final int MAX_ROWS_PER_BATCH = 2000;
    private static final int MAX_RESULTS = 25;
    private static final Pattern CUM = Pattern.compile("^\\d{1,15}-\\d{1,6}$");
    private static final Pattern MARKS = Pattern.compile("\\p{M}+");

    private final JdbcTemplate jdbc;
    private final SecurityEventLogger securityEvents;

    /** Una presentación (CUM) con sus principios activos juntos ("ACETAMINOFEN 500 mg + CAFEINA 65 mg"). */
    public record CumRow(String cum, String productName, String holder, String sanitaryRegistration, String presentation,
                         String atc, String atcDescription, String route, String dosageForm, String activeIngredients,
                         String ium) {
    }

    public record CumEntry(String cum, String productName, String holder, String sanitaryRegistration,
                           String presentation, String atc, String atcDescription, String route, String dosageForm,
                           String activeIngredients, String ium) {
    }

    public record ImportInfo(UUID id, String status, String sourceName, Instant startedAt, Instant finishedAt,
                             int rowsReceived, Integer total, Integer removed) {
    }

    public record Status(long total, ImportInfo lastImport) {
    }

    @Transactional(readOnly = true)
    public Status status() {
        Long total = jdbc.queryForObject("SELECT count(*) FROM platform.cum_catalog", Long.class);
        List<ImportInfo> last = jdbc.query("""
                SELECT id, status, source_name, started_at, finished_at, rows_received, total, removed
                FROM platform.cum_imports WHERE status = 'DONE' ORDER BY finished_at DESC LIMIT 1""",
                (rs, i) -> new ImportInfo(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        rs.getTimestamp(4).toInstant(),
                        rs.getTimestamp(5) == null ? null : rs.getTimestamp(5).toInstant(), rs.getInt(6),
                        (Integer) rs.getObject(7), (Integer) rs.getObject(8)));
        return new Status(total == null ? 0 : total, last.isEmpty() ? null : last.getFirst());
    }

    @Transactional
    public UUID start(UUID adminId, String sourceName) {
        UUID id = Ids.newId();
        String name = sourceName == null || sourceName.isBlank() ? null
                : sourceName.trim().substring(0, Math.min(200, sourceName.trim().length()));
        jdbc.update("""
                INSERT INTO platform.cum_imports (id, status, source_name, started_by, started_at)
                VALUES (?, 'RUNNING', ?, ?, ?)""", id, name, adminId, Timestamp.from(Instant.now()));
        return id;
    }

    /** Agrega o actualiza una tanda; devuelve cuántas filas lleva la carga. */
    @Transactional
    public int addRows(UUID importId, List<CumRow> rows) {
        requireRunning(importId, true);
        if (rows == null || rows.isEmpty() || rows.size() > MAX_ROWS_PER_BATCH) {
            throw new BusinessRuleException("Cada tanda trae entre 1 y " + MAX_ROWS_PER_BATCH + " presentaciones.");
        }
        Timestamp now = Timestamp.from(Instant.now());
        List<Object[]> args = new ArrayList<>(rows.size());
        for (CumRow r : rows) {
            String cum = clean(r.cum(), 30);
            if (cum == null || !CUM.matcher(cum).matches()) {
                throw new BusinessRuleException("CUM inválido en la tanda: " + r.cum());
            }
            String name = clean(r.productName(), 400);
            String ingredients = clean(r.activeIngredients(), 1000);
            if (name == null || ingredients == null) {
                throw new BusinessRuleException("La presentación " + cum + " no trae nombre o principio activo.");
            }
            String[] parts = cum.split("-");
            String registration = clean(r.sanitaryRegistration(), 80);
            String holder = clean(r.holder(), 300);
            String atc = clean(r.atc(), 10);
            args.add(new Object[]{cum, parts[0], Integer.parseInt(parts[1]), name, holder, registration,
                    clean(r.presentation(), 1000), atc == null ? null : atc.toUpperCase(Locale.ROOT),
                    clean(r.atcDescription(), 300), clean(r.route(), 120), clean(r.dosageForm(), 200), ingredients,
                    clean(r.ium(), 40), searchText(name, ingredients, cum, registration, holder, atc), importId, now});
        }
        jdbc.batchUpdate("""
                INSERT INTO platform.cum_catalog (cum, expediente, consecutivo, product_name, holder, sanitary_registration,
                    presentation, atc, atc_description, route, dosage_form, active_ingredients, ium, search_text,
                    import_id, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (cum) DO UPDATE SET expediente = excluded.expediente, consecutivo = excluded.consecutivo,
                    product_name = excluded.product_name, holder = excluded.holder,
                    sanitary_registration = excluded.sanitary_registration, presentation = excluded.presentation,
                    atc = excluded.atc, atc_description = excluded.atc_description, route = excluded.route,
                    dosage_form = excluded.dosage_form, active_ingredients = excluded.active_ingredients,
                    ium = excluded.ium, search_text = excluded.search_text, import_id = excluded.import_id,
                    updated_at = excluded.updated_at""", args);
        Integer received = jdbc.queryForObject("""
                UPDATE platform.cum_imports SET rows_received = (
                    SELECT count(*) FROM platform.cum_catalog WHERE import_id = ?)
                WHERE id = ? RETURNING rows_received""", Integer.class, importId, importId);
        return received == null ? 0 : received;
    }

    /**
     * Cierra la carga: {@code expectedTotal} debe coincidir con lo recibido (si se perdió una tanda no se borra nada);
     * se quitan las presentaciones que ya no vinieron.
     */
    @Transactional
    public ImportInfo finish(UUID importId, int expectedTotal, UUID adminId) {
        requireRunning(importId, true);
        Integer received = jdbc.queryForObject("SELECT count(*) FROM platform.cum_catalog WHERE import_id = ?",
                Integer.class, importId);
        int got = received == null ? 0 : received;
        if (got == 0 || got != expectedTotal) {
            throw new ConflictException("Llegaron " + got + " de " + expectedTotal
                    + " presentaciones: vuelve a cargar el archivo. El catálogo anterior sigue igual.");
        }
        int removed = jdbc.update("DELETE FROM platform.cum_catalog WHERE import_id <> ?", importId);
        jdbc.update("""
                UPDATE platform.cum_imports SET status = 'DONE', finished_at = ?, rows_received = ?, total = ?, removed = ?
                WHERE id = ?""", Timestamp.from(Instant.now()), got, got, removed, importId);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("total", got);
        details.put("removed", removed);
        securityEvents.record(SecurityEvent.CUM_CATALOG_IMPORTED, adminId, null, null, details);
        return status().lastImport();
    }

    /** Búsqueda por nombre, principio activo, CUM, registro o titular (todas las palabras), sin tildes. */
    @Transactional(readOnly = true)
    public List<CumEntry> search(String query) {
        String folded = fold(query == null ? "" : query);
        List<String> words = Arrays.stream(folded.split("\\s+")).filter(w -> w.length() >= 2).limit(6).toList();
        if (words.isEmpty()) {
            return List.of();
        }
        StringBuilder sql = new StringBuilder("""
                SELECT cum, product_name, holder, sanitary_registration, presentation, atc, atc_description, route,
                       dosage_form, active_ingredients, ium
                FROM platform.cum_catalog WHERE true""");
        List<Object> params = new ArrayList<>();
        for (String word : words) {
            sql.append(" AND search_text LIKE ? ESCAPE '\\'");
            params.add("%" + word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        // Primero las que empiezan por la primera palabra (el nombre va al comienzo del texto de búsqueda).
        sql.append(" ORDER BY (search_text LIKE ? ESCAPE '\\') DESC, product_name, consecutivo LIMIT ").append(MAX_RESULTS);
        params.add(words.getFirst().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        return jdbc.query(sql.toString(), (rs, i) -> new CumEntry(rs.getString(1), rs.getString(2), rs.getString(3),
                rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8), rs.getString(9),
                rs.getString(10), rs.getString(11)), params.toArray());
    }

    @Transactional(readOnly = true)
    public CumEntry get(String cum) {
        List<CumEntry> found = jdbc.query("""
                SELECT cum, product_name, holder, sanitary_registration, presentation, atc, atc_description, route,
                       dosage_form, active_ingredients, ium
                FROM platform.cum_catalog WHERE cum = ?""", (rs, i) -> new CumEntry(rs.getString(1), rs.getString(2),
                rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8),
                rs.getString(9), rs.getString(10), rs.getString(11)), cum);
        if (found.isEmpty()) {
            throw new NotFoundException("Ese CUM no está en el catálogo.");
        }
        return found.getFirst();
    }

    private void requireRunning(UUID importId, boolean lock) {
        List<String> status = jdbc.queryForList("SELECT status FROM platform.cum_imports WHERE id = ?"
                + (lock ? " FOR UPDATE" : ""), String.class, importId);
        if (status.isEmpty()) {
            throw new NotFoundException("Carga no encontrada.");
        }
        if (!"RUNNING".equals(status.getFirst())) {
            throw new ConflictException("Esa carga ya terminó.");
        }
    }

    static String searchText(String... parts) {
        StringBuilder text = new StringBuilder();
        for (String part : parts) {
            if (part != null) {
                text.append(fold(part)).append(' ');
            }
        }
        String result = text.toString().trim();
        return result.length() > 3000 ? result.substring(0, 3000) : result;
    }

    /** Minúsculas y sin tildes ("ACETAMINOFÉN" → "acetaminofen"). */
    static String fold(String value) {
        return MARKS.matcher(Normalizer.normalize(value, Normalizer.Form.NFD)).replaceAll("").toLowerCase(Locale.ROOT)
                .trim();
    }

    private static String clean(String value, int max) {
        if (value == null) {
            return null;
        }
        String v = value.replaceAll("\\s+", " ").trim();
        if (v.isEmpty()) {
            return null;
        }
        return v.length() > max ? v.substring(0, max) : v;
    }
}
