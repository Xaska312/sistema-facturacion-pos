package com.poshibrido.identity.application;

import com.poshibrido.identity.domain.User;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * Administradores de plataforma. El permiso vive en {@code platform.users.platform_admin}; {@code
 * PLATFORM_ADMIN_EMAILS} lo sincroniza <b>al arrancar</b> el backend: las cuentas que ya existen con esos correos
 * quedan como administradoras y, si la lista no está vacía, las demás dejan de serlo.
 *
 * <p>Por qué al arrancar y no al iniciar sesión: el registro es abierto y (por ahora) sin verificación de correo.
 * Si el permiso se diera a "quien tenga ese correo", cualquiera que se registrara primero con él sería
 * administrador. Así, el procedimiento es: registrarse, poner el correo en la configuración y reiniciar.
 * Sin correos configurados no se toca nada (el permiso se puede dar a mano en la base).
 */
@Slf4j
@Component
public class PlatformAdmins {

    private final Set<String> emails;
    private final JdbcTemplate jdbc;

    public PlatformAdmins(PlatformProperties properties, DataSource dataSource) {
        List<String> configured = properties.adminEmails() == null ? List.of() : properties.adminEmails();
        this.emails = configured.stream()
                .filter(e -> e != null && !e.isBlank())
                .map(e -> e.trim().toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
        this.jdbc = new JdbcTemplate(dataSource);
    }

    public boolean isAdmin(User user) {
        return user.isPlatformAdmin();
    }

    /** Aplica {@code PLATFORM_ADMIN_EMAILS} a las cuentas existentes (al arrancar; los tests la llaman a mano). */
    @EventListener(ApplicationReadyEvent.class)
    public void syncConfiguredAdmins() {
        if (emails.isEmpty()) {
            return;
        }
        List<String> list = new ArrayList<>(emails);
        String placeholders = String.join(", ", Collections.nCopies(list.size(), "?"));
        int granted = jdbc.update("UPDATE platform.users SET platform_admin = TRUE WHERE NOT platform_admin AND email IN ("
                + placeholders + ")", list.toArray());
        int revoked = jdbc.update("UPDATE platform.users SET platform_admin = FALSE WHERE platform_admin AND email NOT IN ("
                + placeholders + ")", list.toArray());
        Set<String> existing = new TreeSet<>(jdbc.queryForList(
                "SELECT email FROM platform.users WHERE email IN (" + placeholders + ")", String.class, list.toArray()));
        Set<String> missing = new TreeSet<>(emails);
        missing.removeAll(existing);
        log.info("Administradores de plataforma: {} configurados, {} con permiso nuevo, {} sin permiso ahora",
                emails.size(), granted, revoked);
        if (!missing.isEmpty()) {
            log.warn("PLATFORM_ADMIN_EMAILS tiene correos sin cuenta ({}): regístralos en la app y reinicia el backend",
                    missing);
        }
    }
}
