package com.poshibrido.tenancy.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.identity.application.MembershipApi;
import com.poshibrido.identity.application.UserApi;
import com.poshibrido.identity.application.UserSummary;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.EmailNotVerifiedException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.error.ServiceUnavailableException;
import com.poshibrido.tenancy.domain.Tenant;
import com.poshibrido.tenancy.domain.TenantSchemas;
import com.poshibrido.tenancy.domain.TenantStatus;
import com.poshibrido.tenancy.infrastructure.TenantRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Aprovisionamiento de un negocio:
 * <ol>
 *   <li>Registrar el tenant en PROVISIONING (transacción de plataforma).</li>
 *   <li>CREATE SCHEMA + Flyway {@code db/tenant} (incluye datos base).</li>
 *   <li>Sembrar al dueño como miembro con rol OWNER.</li>
 *   <li>Crear la membresía y pasar a ACTIVE (una transacción).</li>
 * </ol>
 * Si algo falla: DROP SCHEMA ... CASCADE, estado FAILED y se permite reintentar.
 */
@Slf4j
@Service
public class TenantProvisioningService {

    private final TenantRepository tenants;
    private final TenantSchemaManager schemaManager;
    private final TenantDataSeeder seeder;
    private final MembershipApi memberships;
    private final UserApi users;
    private final TenantDirectory directory;
    private final TransactionTemplate tx;
    private final SecurityEventLogger securityEvents;
    private final AuditLogger audit;
    private final boolean requireEmailVerification;

    public TenantProvisioningService(TenantRepository tenants, TenantSchemaManager schemaManager,
                                     TenantDataSeeder seeder, MembershipApi memberships, UserApi users,
                                     TenantDirectory directory, PlatformTransactionManager transactionManager,
                                     SecurityEventLogger securityEvents, AuditLogger audit,
                                     @Value("${app.auth.require-email-verification:true}")
                                     boolean requireEmailVerification) {
        this.tenants = tenants;
        this.schemaManager = schemaManager;
        this.seeder = seeder;
        this.memberships = memberships;
        this.users = users;
        this.directory = directory;
        this.tx = new TransactionTemplate(transactionManager);
        this.securityEvents = securityEvents;
        this.audit = audit;
        this.requireEmailVerification = requireEmailVerification;
    }

    public TenantSummary create(UUID ownerId, CreateTenantCommand command) {
        if (!TenantSchemas.isValidSlug(command.slug())) {
            throw new BusinessRuleException(
                    "El identificador debe iniciar con letra y contener solo minúsculas, números o '_' (3 a 41).");
        }
        if (!command.businessType().isAvailable()) {
            throw new BusinessRuleException("El tipo de negocio " + command.businessType() + " aún no está disponible.");
        }
        UserSummary owner = users.requireActive(ownerId);
        // Solo con el correo confirmado: un negocio a nombre de un correo ajeno no debe poder existir.
        if (requireEmailVerification && !owner.emailVerified()) {
            throw new EmailNotVerifiedException();
        }

        Tenant created = tx.execute(status -> {
            if (tenants.existsBySlug(command.slug())) {
                throw new ConflictException("Ya existe un negocio con el identificador '" + command.slug() + "'.");
            }
            return tenants.save(Tenant.startProvisioning(command.slug(), command.legalName().trim(),
                    command.tradeName().trim(), command.businessType(), ownerId));
        });
        return provision(created.getId(), owner);
    }

    public TenantSummary retry(UUID ownerId, UUID tenantId) {
        UserSummary owner = users.requireActive(ownerId);
        tx.executeWithoutResult(status -> {
            Tenant tenant = tenants.findById(tenantId)
                    .filter(t -> t.isOwnedBy(ownerId))
                    .orElseThrow(() -> new NotFoundException("Negocio no encontrado."));
            if (tenant.getStatus() != TenantStatus.FAILED) {
                throw new ConflictException("Solo se puede reintentar un negocio cuyo aprovisionamiento falló.");
            }
            tenant.retryProvisioning();
        });
        return provision(tenantId, owner);
    }

    private TenantSummary provision(UUID tenantId, UserSummary owner) {
        Tenant tenant = tenants.findById(tenantId).orElseThrow();
        String schema = tenant.getSchemaName();
        try {
            schemaManager.createAndMigrate(schema);
            seeder.seedOwner(schema, owner.id(), owner.fullName());
            Tenant activated = tx.execute(status -> {
                Tenant t = tenants.findById(tenantId).orElseThrow();
                memberships.grantActive(owner.id(), tenantId);
                t.markActive();
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("slug", t.getSlug());
                data.put("legalName", t.getLegalName());
                data.put("tradeName", t.getTradeName());
                data.put("businessType", t.getBusinessType());
                securityEvents.record(SecurityEvent.TENANT_CREATED, owner.id(), owner.email(), tenantId, data);
                // Auditoría del negocio: quién lo creó y con qué datos (el sembrado del dueño ya dejó
                // TENANT_PROVISIONED, sin datos).
                audit.logIn(schema, owner.id(), "BUSINESS_CREATED", "business", tenantId, null, data);
                return t;
            });
            directory.evict(tenantId);
            log.info("Negocio {} aprovisionado en schema {}", tenantId, schema);
            return TenantSummary.of(activated, owner.id());
        } catch (RuntimeException ex) {
            log.error("Falló el aprovisionamiento del negocio {} (schema {})", tenantId, schema, ex);
            rollbackProvisioning(tenantId, schema, ex);
            recordFailure(owner, tenantId, ex);
            throw new ServiceUnavailableException(
                    "No fue posible crear el negocio en este momento. Puedes reintentar la operación.");
        }
    }

    private void recordFailure(UserSummary owner, UUID tenantId, RuntimeException cause) {
        try {
            tx.executeWithoutResult(status -> securityEvents.record(SecurityEvent.TENANT_PROVISIONING_FAILED,
                    owner.id(), owner.email(), tenantId, Map.of("reason", cause.getClass().getSimpleName())));
        } catch (RuntimeException ex) {
            log.error("No se pudo registrar el fallo de aprovisionamiento del negocio {}", tenantId, ex);
        }
    }

    private void rollbackProvisioning(UUID tenantId, String schema, RuntimeException cause) {
        try {
            schemaManager.drop(schema);
        } catch (RuntimeException dropEx) {
            log.error("No se pudo eliminar el schema {} tras el fallo", schema, dropEx);
        }
        try {
            tx.executeWithoutResult(status -> tenants.findById(tenantId)
                    .ifPresent(t -> t.markFailed(cause.getClass().getSimpleName())));
        } catch (RuntimeException markEx) {
            log.error("No se pudo marcar como FAILED el negocio {}", tenantId, markEx);
        }
        directory.evict(tenantId);
    }
}
