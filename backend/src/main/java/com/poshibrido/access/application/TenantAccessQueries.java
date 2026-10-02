package com.poshibrido.access.application;

import com.poshibrido.tenancy.domain.TenantSchemas;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.util.List;
import java.util.UUID;

/**
 * Implementación JDBC con nombres de schema calificados (validados por {@link TenantSchemas}).
 */
@Service
public class TenantAccessQueries implements AccessApi {

    private final JdbcTemplate jdbc;

    public TenantAccessQueries(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public boolean isMemberActive(String tenantSchema, UUID memberId) {
        String schema = TenantSchemas.requireTenantSchema(tenantSchema);
        List<Boolean> active = jdbc.queryForList(
                "SELECT active FROM " + schema + ".members WHERE id = ?", Boolean.class, memberId);
        return !active.isEmpty() && Boolean.TRUE.equals(active.getFirst());
    }

    @Override
    public List<String> permissionsOf(String tenantSchema, UUID memberId) {
        String schema = TenantSchemas.requireTenantSchema(tenantSchema);
        return jdbc.queryForList("""
                SELECT DISTINCT rp.permission_code
                FROM %1$s.member_roles mr
                JOIN %1$s.role_permissions rp ON rp.role_id = mr.role_id
                JOIN %1$s.members m ON m.id = mr.member_id
                WHERE mr.member_id = ? AND m.active
                ORDER BY rp.permission_code
                """.formatted(schema), String.class, memberId);
    }
}
