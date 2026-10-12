package com.poshibrido.subscription.application;

import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.subscription.application.SubscriptionViews.ActivationCodeView;
import com.poshibrido.subscription.application.SubscriptionViews.CodeStatus;
import com.poshibrido.subscription.application.SubscriptionViews.CreatedCodes;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Códigos de activación ({@code platform.activation_codes}): el administrador los genera al vender un plan y el
 * cliente los usa al crear su negocio. Formato {@code XXXX-XXXX-XXXX} sin caracteres que se confundan (0/O, 1/I/L);
 * se guarda solo el hash y los últimos 4 caracteres como pista. Un código sirve una sola vez.
 */
@Service
public class ActivationCodeService {

    static final String INVALID = "El código de activación no es válido, ya se usó o venció.";
    private static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private static final int GROUPS = 3;
    private static final int GROUP_SIZE = 4;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;

    public ActivationCodeService(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** Código usado: plan y meses que incluye. */
    public record Redeemed(String planCode, int months, String hint) {
    }

    @Transactional
    public CreatedCodes create(String planCode, int months, int validDays, String note, int quantity, UUID adminId) {
        if (months < 1 || months > 36) {
            throw new BusinessRuleException("Un código incluye de 1 a 36 meses.");
        }
        if (validDays < 1 || validDays > 365) {
            throw new BusinessRuleException("La vigencia del código va de 1 a 365 días.");
        }
        if (quantity < 1 || quantity > 20) {
            throw new BusinessRuleException("Se generan de 1 a 20 códigos a la vez.");
        }
        Integer plan = jdbc.queryForObject("SELECT count(*) FROM platform.plans WHERE code = ? AND active",
                Integer.class, planCode);
        if (plan == null || plan == 0) {
            throw new BusinessRuleException("El plan " + planCode + " no existe o no está activo.");
        }
        Instant now = Instant.now();
        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        List<String> codes = new ArrayList<>();
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < quantity; i++) {
            String code = newCode();
            UUID id = Ids.newId();
            String normalized = normalize(code);
            jdbc.update("""
                    INSERT INTO platform.activation_codes (id, code_hash, code_hint, plan_code, months, note, expires_at,
                                                           created_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    id, sha256(normalized), normalized.substring(normalized.length() - 4), planCode, months, cleanNote,
                    Timestamp.from(now.plus(Duration.ofDays(validDays))), adminId, Timestamp.from(now));
            codes.add(code);
            ids.add(id);
        }
        List<ActivationCodeView> details = ids.stream().map(this::find).toList();
        return new CreatedCodes(codes, details);
    }

    @Transactional(readOnly = true)
    public List<ActivationCodeView> list() {
        return jdbc.query(SELECT + " ORDER BY c.created_at DESC LIMIT 200", this::map);
    }

    @Transactional
    public ActivationCodeView revoke(UUID id) {
        ActivationCodeView code = find(id);
        if (code.status() == CodeStatus.USED) {
            throw new ConflictException("Ese código ya se usó: no se puede anular.");
        }
        jdbc.update("UPDATE platform.activation_codes SET revoked_at = now() WHERE id = ? AND revoked_at IS NULL", id);
        return find(id);
    }

    /** Usa el código para un negocio nuevo (en la transacción que lo crea). 422 si no sirve. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Redeemed redeem(String rawCode, UUID userId, UUID tenantId) {
        String normalized = normalize(rawCode);
        if (normalized.length() != GROUPS * GROUP_SIZE) {
            throw new BusinessRuleException(INVALID);
        }
        List<Redeemed> found = jdbc.query("""
                SELECT plan_code, months, code_hint FROM platform.activation_codes
                WHERE code_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
                FOR UPDATE""",
                (rs, i) -> new Redeemed(rs.getString("plan_code"), rs.getInt("months"), rs.getString("code_hint")),
                sha256(normalized));
        if (found.isEmpty()) {
            throw new BusinessRuleException(INVALID);
        }
        jdbc.update("""
                UPDATE platform.activation_codes SET used_at = now(), used_by = ?, used_tenant_id = ?
                WHERE code_hash = ?""", userId, tenantId, sha256(normalized));
        return found.getFirst();
    }

    private ActivationCodeView find(UUID id) {
        return jdbc.query(SELECT + " WHERE c.id = ?", this::map, id).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Código no encontrado."));
    }

    private static final String SELECT = """
            SELECT c.id, c.code_hint, c.plan_code, p.name AS plan_name, c.months, c.note, c.expires_at, c.created_at,
                   c.used_at, c.revoked_at, t.trade_name AS used_tenant_name
            FROM platform.activation_codes c
            JOIN platform.plans p ON p.code = c.plan_code
            LEFT JOIN platform.tenants t ON t.id = c.used_tenant_id""";

    private ActivationCodeView map(ResultSet rs, int row) throws SQLException {
        Instant expiresAt = rs.getTimestamp("expires_at").toInstant();
        Instant usedAt = instant(rs, "used_at");
        Instant revokedAt = instant(rs, "revoked_at");
        CodeStatus status = usedAt != null ? CodeStatus.USED
                : revokedAt != null ? CodeStatus.REVOKED
                : expiresAt.isAfter(Instant.now()) ? CodeStatus.AVAILABLE : CodeStatus.EXPIRED;
        return new ActivationCodeView(rs.getObject("id", UUID.class), rs.getString("code_hint"),
                rs.getString("plan_code"), rs.getString("plan_name"), rs.getInt("months"), rs.getString("note"),
                status, expiresAt, rs.getTimestamp("created_at").toInstant(), usedAt,
                rs.getString("used_tenant_name"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    static String newCode() {
        StringBuilder code = new StringBuilder();
        for (int g = 0; g < GROUPS; g++) {
            if (g > 0) {
                code.append('-');
            }
            for (int i = 0; i < GROUP_SIZE; i++) {
                code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            }
        }
        return code.toString();
    }

    /** Mayúsculas, sin espacios ni guiones: "abcd-efgh-jkmn " y "ABCDEFGHJKMN" son el mismo código. */
    static String normalize(String raw) {
        if (raw == null || raw.length() > 40) {
            return "";
        }
        return raw.toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
    }

    static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 no disponible", ex);
        }
    }
}
