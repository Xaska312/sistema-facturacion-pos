package com.poshibrido.access.application;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.tenancy.application.TenantDataSeeder;
import com.poshibrido.tenancy.domain.TenantSchemas;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.UUID;

/**
 * Registra al dueño como miembro del negocio con rol OWNER y acceso a la sede principal.
 */
@Component
public class OwnerMemberSeeder implements TenantDataSeeder {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public OwnerMemberSeeder(DataSource dataSource, PlatformTransactionManager transactionManager) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public void seedOwner(String tenantSchema, UUID ownerUserId, String ownerDisplayName) {
        String s = TenantSchemas.requireTenantSchema(tenantSchema);
        tx.executeWithoutResult(status -> {
            jdbc.update("""
                    INSERT INTO %1$s.members (id, display_name, default_branch_id, active,
                                              created_at, created_by, updated_at, updated_by, version)
                    VALUES (?, ?, (SELECT id FROM %1$s.branches WHERE code = 'PRINCIPAL'), TRUE,
                            now(), ?, now(), ?, 0)
                    """.formatted(s), ownerUserId, ownerDisplayName, ownerUserId, ownerUserId);
            jdbc.update("INSERT INTO %1$s.member_roles (member_id, role_id) SELECT ?, id FROM %1$s.roles WHERE code = 'OWNER'"
                    .formatted(s), ownerUserId);
            jdbc.update("INSERT INTO %1$s.member_branches (member_id, branch_id) SELECT ?, id FROM %1$s.branches WHERE code = 'PRINCIPAL'"
                    .formatted(s), ownerUserId);
            jdbc.update("""
                    INSERT INTO %1$s.audit_log (id, actor_id, action, entity, entity_id, created_at)
                    VALUES (?, ?, 'TENANT_PROVISIONED', 'member', ?, now())
                    """.formatted(s), Ids.newId(), ownerUserId, ownerUserId.toString());
        });
    }
}
