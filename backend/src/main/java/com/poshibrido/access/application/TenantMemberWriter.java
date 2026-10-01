package com.poshibrido.access.application;

import com.poshibrido.tenancy.domain.TenantSchemas;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Escritura de miembros en el schema de un negocio sin tenant en contexto (al aceptar una invitación
 * la petición todavía no tiene negocio). Usa nombres de schema calificados y validados.
 */
@Component
public class TenantMemberWriter {

    private final JdbcTemplate jdbc;

    public TenantMemberWriter(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** Roles existentes (excluye OWNER) entre los indicados. */
    public List<UUID> existingAssignableRoles(String tenantSchema, Collection<UUID> roleIds) {
        String s = TenantSchemas.requireTenantSchema(tenantSchema);
        if (roleIds.isEmpty()) {
            return List.of();
        }
        return jdbc.queryForList("SELECT id FROM " + s + ".roles WHERE code <> 'OWNER' AND id IN (" + placeholders(roleIds) + ")",
                UUID.class, roleIds.toArray());
    }

    /** Sucursales activas entre las indicadas, ordenadas por código. */
    public List<UUID> activeBranches(String tenantSchema, Collection<UUID> branchIds) {
        String s = TenantSchemas.requireTenantSchema(tenantSchema);
        if (branchIds.isEmpty()) {
            return List.of();
        }
        return jdbc.queryForList("SELECT id FROM " + s + ".branches WHERE active AND id IN (" + placeholders(branchIds)
                + ") ORDER BY code", UUID.class, branchIds.toArray());
    }

    /** ¿Existe el miembro y está activo? */
    public boolean isActiveMember(String tenantSchema, UUID userId) {
        String s = TenantSchemas.requireTenantSchema(tenantSchema);
        List<Boolean> active = jdbc.queryForList("SELECT active FROM " + s + ".members WHERE id = ?", Boolean.class, userId);
        return !active.isEmpty() && Boolean.TRUE.equals(active.getFirst());
    }

    /**
     * Crea el miembro o lo reactiva, reemplazando sus roles y sucursales.
     * Debe ejecutarse dentro de la transacción del caso de uso.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void upsertMember(String tenantSchema, UUID userId, String displayName, List<UUID> roleIds,
                             List<UUID> branchIds, UUID actorId) {
        String s = TenantSchemas.requireTenantSchema(tenantSchema);
        jdbc.update("""
                INSERT INTO %1$s.members AS m (id, display_name, default_branch_id, active,
                                               created_at, created_by, updated_at, updated_by, version)
                VALUES (?, ?, ?, TRUE, now(), ?, now(), ?, 0)
                ON CONFLICT (id) DO UPDATE SET active = TRUE,
                    display_name = EXCLUDED.display_name,
                    default_branch_id = EXCLUDED.default_branch_id,
                    updated_at = now(), updated_by = EXCLUDED.updated_by, version = m.version + 1
                """.formatted(s), userId, displayName, branchIds.getFirst(), actorId, actorId);
        jdbc.update("DELETE FROM " + s + ".member_roles WHERE member_id = ?", userId);
        jdbc.update("DELETE FROM " + s + ".member_branches WHERE member_id = ?", userId);
        for (UUID roleId : roleIds) {
            jdbc.update("INSERT INTO " + s + ".member_roles (member_id, role_id) VALUES (?, ?)", userId, roleId);
        }
        for (UUID branchId : branchIds) {
            jdbc.update("INSERT INTO " + s + ".member_branches (member_id, branch_id) VALUES (?, ?)", userId, branchId);
        }
    }

    private static String placeholders(Collection<?> values) {
        return values.stream().map(v -> "?").collect(Collectors.joining(","));
    }
}
