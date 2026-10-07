package com.poshibrido.tenancy.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.identity.application.SessionApi;
import com.poshibrido.identity.application.UserApi;
import com.poshibrido.identity.application.UserSummary;
import com.poshibrido.mail.MailMessage;
import com.poshibrido.mail.MailTemplates;
import com.poshibrido.mail.Mailer;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.tenancy.domain.Tenant;
import com.poshibrido.tenancy.domain.TenantStatus;
import com.poshibrido.tenancy.infrastructure.TenantRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.UUID;

/**
 * Suspensión de negocios ("eliminar" = SUSPENDED: el schema y los datos se conservan) y listado para la consola de
 * plataforma.
 * <ul>
 *   <li>El administrador de plataforma suspende (con motivo) y reactiva cualquier negocio.</li>
 *   <li>El dueño puede cerrar su negocio (escribiendo su nombre y su contraseña); solo el administrador lo
 *       reactiva.</li>
 * </ul>
 * Al suspender se revocan las sesiones de todos sus miembros y el negocio deja de resolverse en
 * {@link TenantDirectory#findActive}: las peticiones con un token vigente reciben 403.
 */
@Service
public class TenantAdministrationService {

    /** Negocio en la consola de plataforma. */
    public record PlatformTenantView(UUID id, String slug, String legalName, String tradeName, String businessType,
                                     String status, UUID ownerId, String ownerEmail, String ownerName,
                                     long activeMembers, Instant createdAt, Instant suspendedAt,
                                     String suspensionReason, boolean closedByOwner) {
    }

    private final TenantRepository tenants;
    private final TenantDirectory directory;
    private final SessionApi sessions;
    private final UserApi users;
    private final SecurityEventLogger securityEvents;
    private final AuditLogger audit;
    private final JdbcTemplate jdbc;
    private final Mailer mailer;
    private final MailTemplates templates;
    private final TenantSchemaManager schemas;

    public TenantAdministrationService(TenantRepository tenants, TenantDirectory directory, SessionApi sessions,
                                       UserApi users, SecurityEventLogger securityEvents, AuditLogger audit,
                                       DataSource dataSource, Mailer mailer, MailTemplates templates,
                                       TenantSchemaManager schemas) {
        this.tenants = tenants;
        this.directory = directory;
        this.sessions = sessions;
        this.users = users;
        this.securityEvents = securityEvents;
        this.audit = audit;
        this.jdbc = new JdbcTemplate(dataSource);
        this.mailer = mailer;
        this.templates = templates;
        this.schemas = schemas;
    }

    // ---------------------------------------------------------------- consola de plataforma

    /**
     * @param text   nombre comercial, razón social, identificador o correo del dueño (contiene)
     * @param status filtro opcional por estado
     */
    @Transactional(readOnly = true)
    public PageResponse<PlatformTenantView> list(String text, TenantStatus status, int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), PageRequests.MAX_SIZE);
        StringBuilder where = new StringBuilder(" WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (status != null) {
            where.append(" AND t.status = ?");
            args.add(status.name());
        }
        if (text != null && !text.isBlank()) {
            String pattern = "%" + escapeLike(text.trim().toLowerCase(Locale.ROOT)) + "%";
            where.append(" AND (lower(t.trade_name) LIKE ? ESCAPE '\\' OR lower(t.legal_name) LIKE ? ESCAPE '\\'"
                    + " OR t.slug LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')");
            for (int i = 0; i < 4; i++) {
                args.add(pattern);
            }
        }
        String tables = " FROM platform.tenants t JOIN platform.users u ON u.id = t.owner_user_id";
        Long total = jdbc.queryForObject("SELECT count(*)" + tables + where, Long.class, args.toArray());
        long count = total == null ? 0 : total;
        List<PlatformTenantView> rows = List.of();
        if (count > 0) {
            List<Object> pageArgs = new ArrayList<>(args);
            pageArgs.add(safeSize);
            pageArgs.add((long) safePage * safeSize);
            rows = jdbc.query("""
                    SELECT t.id, t.slug, t.legal_name, t.trade_name, t.business_type, t.status, t.owner_user_id,
                           u.email AS owner_email, u.full_name AS owner_name,
                           (SELECT count(*) FROM platform.memberships m
                             WHERE m.tenant_id = t.id AND m.status = 'ACTIVE') AS active_members,
                           t.created_at, t.suspended_at, t.suspension_reason, t.closed_by_owner
                    """ + tables + where + " ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
                    (rs, i) -> {
                        return new PlatformTenantView(
                                rs.getObject("id", UUID.class),
                                rs.getString("slug"),
                                rs.getString("legal_name"),
                                rs.getString("trade_name"),
                                rs.getString("business_type"),
                                rs.getString("status"),
                                rs.getObject("owner_user_id", UUID.class),
                                rs.getString("owner_email"),
                                rs.getString("owner_name"),
                                rs.getLong("active_members"),
                                instant(rs.getTimestamp("created_at")),
                                instant(rs.getTimestamp("suspended_at")),
                                rs.getString("suspension_reason"),
                                rs.getBoolean("closed_by_owner"));
                    },
                    pageArgs.toArray());
        }
        int totalPages = (int) ((count + safeSize - 1) / safeSize);
        return new PageResponse<>(rows, safePage, safeSize, count, totalPages);
    }

    /** El administrador suspende un negocio activo. El motivo lo verán sus miembros al iniciar sesión. */
    @Transactional
    public TenantSummary suspend(UUID tenantId, UUID adminId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new BusinessRuleException("Escribe el motivo de la suspensión (lo verán los miembros del negocio).");
        }
        Tenant tenant = require(tenantId);
        if (tenant.getStatus() != TenantStatus.ACTIVE) {
            throw new ConflictException("Solo se puede suspender un negocio activo.");
        }
        tenant.suspend(adminId, reason, Instant.now(), false);
        afterStatusChange(tenant);
        securityEvents.record(SecurityEvent.TENANT_SUSPENDED, adminId, null, tenantId,
                Map.of("reason", tenant.getSuspensionReason()));
        audit.logIn(tenant.getSchemaName(), null, "BUSINESS_SUSPENDED", "business", tenantId,
                Map.of("status", "ACTIVE"), suspensionData(tenant, "plataforma"));
        notifyOwner(tenant, owner -> templates.tenantSuspended(owner.email(), owner.fullName(), tenant.getTradeName(),
                tenant.getSuspensionReason()));
        return TenantSummary.of(tenant, adminId);
    }

    @Transactional
    public TenantSummary reactivate(UUID tenantId, UUID adminId) {
        Tenant tenant = require(tenantId);
        if (tenant.getStatus() != TenantStatus.SUSPENDED) {
            throw new ConflictException("Solo se puede reactivar un negocio suspendido.");
        }
        Map<String, Object> before = suspensionData(tenant, tenant.isClosedByOwner() ? "dueño" : "plataforma");
        // Si hubo una versión nueva mientras estaba suspendido, su schema quedó atrás: se pone al día antes de
        // abrirlo (Flyway no hace nada si ya está al día).
        schemas.migrate(tenant.getSchemaName());
        tenant.reactivate();
        afterStatusChange(tenant);
        securityEvents.record(SecurityEvent.TENANT_REACTIVATED, adminId, null, tenantId, null);
        audit.logIn(tenant.getSchemaName(), null, "BUSINESS_REACTIVATED", "business", tenantId, before,
                Map.of("status", "ACTIVE"));
        notifyOwner(tenant, owner -> templates.tenantReactivated(owner.email(), owner.fullName(),
                tenant.getTradeName()));
        return TenantSummary.of(tenant, adminId);
    }

    // ---------------------------------------------------------------- dueño

    /**
     * El dueño cierra ("elimina") su negocio: queda SUSPENDED con sus datos. Exige escribir el nombre comercial y
     * la contraseña (una sesión robada no basta). Los errores de confirmación son 422, no 401: el frontend no debe
     * interpretarlos como sesión vencida. Una contraseña equivocada queda en los eventos de seguridad (la transacción
     * no se revierte con esos errores: no cambió nada).
     */
    @Transactional(noRollbackFor = BusinessRuleException.class)
    public void closeByOwner(UUID tenantId, UUID ownerId, String confirmation, String password, String reason) {
        Tenant tenant = require(tenantId);
        if (!tenant.isOwnedBy(ownerId)) {
            throw new ForbiddenException("Solo el dueño puede eliminar el negocio.");
        }
        if (tenant.getStatus() != TenantStatus.ACTIVE) {
            throw new ConflictException("El negocio no está activo.");
        }
        if (confirmation == null || !confirmation.trim().equalsIgnoreCase(tenant.getTradeName().trim())) {
            throw new BusinessRuleException("Escribe el nombre del negocio exactamente como aparece: "
                    + tenant.getTradeName() + ".");
        }
        if (!users.passwordMatches(ownerId, password)) {
            securityEvents.record(SecurityEvent.TENANT_CLOSE_DENIED, ownerId, null, tenantId,
                    Map.of("reason", "BAD_PASSWORD"));
            throw new BusinessRuleException("La contraseña no es correcta.");
        }
        String finalReason = reason == null || reason.isBlank() ? "Cerrado por el dueño" : reason;
        tenant.suspend(ownerId, finalReason, Instant.now(), true);
        afterStatusChange(tenant);
        securityEvents.record(SecurityEvent.TENANT_CLOSED, ownerId, null, tenantId,
                Map.of("reason", tenant.getSuspensionReason()));
        audit.logIn(tenant.getSchemaName(), ownerId, "BUSINESS_CLOSED", "business", tenantId,
                Map.of("status", "ACTIVE"), suspensionData(tenant, "dueño"));
        notifyOwner(tenant, owner -> templates.tenantClosed(owner.email(), owner.fullName(), tenant.getTradeName()));
    }

    // ---------------------------------------------------------------- apoyo

    /** Correo al dueño (sale después de confirmar la transacción). */
    private void notifyOwner(Tenant tenant, Function<UserSummary, MailMessage> message) {
        UUID ownerId = tenant.getOwnerUserId();
        UserSummary owner = users.findSummaries(Set.of(ownerId)).get(ownerId);
        if (owner != null) {
            mailer.send(message.apply(owner));
        }
    }

    private Tenant require(UUID tenantId) {
        return tenants.findById(tenantId).orElseThrow(() -> new NotFoundException("Negocio no encontrado."));
    }

    /**
     * Cierra las sesiones del negocio y limpia la caché del directorio ahora y otra vez al confirmar (para que una
     * petición concurrente no vuelva a guardar el estado anterior durante 30 s).
     */
    private void afterStatusChange(Tenant tenant) {
        UUID id = tenant.getId();
        if (tenant.getStatus() == TenantStatus.SUSPENDED) {
            sessions.revokeAllTenantSessions(id);
        }
        directory.evict(id);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    directory.evict(id);
                }
            });
        }
    }

    private static Map<String, Object> suspensionData(Tenant tenant, String by) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "SUSPENDED");
        data.put("reason", tenant.getSuspensionReason());
        data.put("by", by);
        return data;
    }

    private static Instant instant(java.sql.Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
