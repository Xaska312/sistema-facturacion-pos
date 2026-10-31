package com.poshibrido.identity.application;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.web.ClientInfo;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.util.UUID;

/**
 * Prueba de la autorización de datos personales (Ley 1581 de 2012, decisión 250): versión de los Términos y de la
 * Política que aceptó cada persona, con fecha, IP y navegador ({@code platform.legal_consents}).
 */
@Service
public class LegalConsentService {

    /**
     * Versiones vigentes. Deben coincidir con {@code frontend/src/app/features/legal/legal-content.ts}: si cambia el
     * fondo de un texto, se sube la versión en los dos lados y la app vuelve a pedir la aceptación.
     */
    public static final String TERMS_VERSION = "1.1";
    public static final String PRIVACY_VERSION = "1.1";

    /** @param accepted si la persona ya aceptó las versiones vigentes */
    public record Status(boolean accepted, String termsVersion, String privacyVersion) {
    }

    private final JdbcTemplate jdbc;

    public LegalConsentService(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** Registra la aceptación de las versiones vigentes desde la petición en curso. */
    @Transactional
    public Status accept(UUID userId) {
        jdbc.update("""
                INSERT INTO platform.legal_consents (id, user_id, terms_version, privacy_version, ip, user_agent)
                VALUES (?, ?, ?, ?, ?, ?)""",
                Ids.newId(), userId, TERMS_VERSION, PRIVACY_VERSION, ClientInfo.ip(), ClientInfo.userAgent());
        return new Status(true, TERMS_VERSION, PRIVACY_VERSION);
    }

    @Transactional(readOnly = true)
    public Status status(UUID userId) {
        Integer count = jdbc.queryForObject("""
                SELECT count(*) FROM platform.legal_consents
                 WHERE user_id = ? AND terms_version = ? AND privacy_version = ?""",
                Integer.class, userId, TERMS_VERSION, PRIVACY_VERSION);
        return new Status(count != null && count > 0, TERMS_VERSION, PRIVACY_VERSION);
    }
}
