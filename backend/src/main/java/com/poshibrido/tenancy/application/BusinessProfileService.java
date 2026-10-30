package com.poshibrido.tenancy.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.tenancy.domain.BusinessModule;
import com.poshibrido.tenancy.domain.BusinessType;
import com.poshibrido.tenancy.domain.Tenant;
import com.poshibrido.tenancy.domain.TenantStatus;
import com.poshibrido.tenancy.infrastructure.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Tipo de negocio y módulos encendidos (Fase 12a, decisión 267).
 * <ul>
 *   <li>Solo el dueño los cambia, en Ajustes. Puede elegir un tipo abierto (Comercio, Servicios) o dejar el que tiene;
 *       los tipos "Pronto" (Restaurante, Farmacia) solo los asigna el administrador de plataforma a negocios piloto.</li>
 *   <li>Nada se borra: un módulo apagado sale del token (y de las pantallas) en la siguiente renovación, y vuelve con
 *       todos sus datos al prenderlo.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class BusinessProfileService {

    /** Lo que ve Ajustes: el tipo, los módulos encendidos y si quien mira puede cambiarlos (el dueño). */
    public record BusinessProfile(BusinessType businessType, List<BusinessModule> modules, boolean canEdit) {
    }

    private final TenantRepository tenants;
    private final TenantDirectory directory;
    private final SecurityEventLogger securityEvents;
    private final AuditLogger audit;

    @Transactional(readOnly = true)
    public BusinessProfile profile(UUID tenantId, UUID viewerId) {
        return view(require(tenantId), viewerId);
    }

    /** El dueño cambia el tipo y los módulos de su negocio. */
    @Transactional
    public BusinessProfile change(UUID tenantId, UUID actorId, BusinessType type, Collection<BusinessModule> modules) {
        Tenant tenant = require(tenantId);
        if (!tenant.isOwnedBy(actorId)) {
            throw new ForbiddenException("Solo el dueño del negocio puede cambiar el tipo y los módulos.");
        }
        requireOwnerCanChoose(tenant.getBusinessType(), type);
        Set<BusinessModule> requested = modules == null ? Set.of() : Set.copyOf(modules);
        BusinessModule.missingRequirement(requested).ifPresent(m -> {
            throw new BusinessRuleException(m == BusinessModule.KITCHEN
                    ? "Cocina y comandas necesita Mesas encendido."
                    : "Ese módulo necesita otro que está apagado.");
        });
        apply(tenant, actorId, type, requested, "dueño");
        return view(tenant, actorId);
    }

    /**
     * El administrador de plataforma asigna un tipo (también los "Pronto", para pilotos); el negocio queda con los
     * módulos de ese tipo y el dueño los ajusta después en Ajustes.
     */
    @Transactional
    public TenantSummary assignByPlatform(UUID tenantId, UUID adminId, BusinessType type) {
        Tenant tenant = require(tenantId);
        if (tenant.getStatus() == TenantStatus.DELETED) {
            throw new ConflictException("El negocio fue eliminado.");
        }
        apply(tenant, adminId, type, type.defaultModules(), "plataforma");
        return TenantSummary.of(tenant, adminId);
    }

    /**
     * El dueño puede elegir un tipo abierto o quedarse con el que tiene (un piloto de Restaurante no lo pierde al
     * cambiar sus módulos).
     */
    static void requireOwnerCanChoose(BusinessType current, BusinessType requested) {
        if (requested == null) {
            throw new BusinessRuleException("Elige el tipo de negocio.");
        }
        if (!requested.isOpen() && requested != current) {
            throw new BusinessRuleException("Ese tipo de negocio estará disponible pronto. Por ahora elige Comercio "
                    + "o Servicios.");
        }
    }

    private void apply(Tenant tenant, UUID actorId, BusinessType type, Set<BusinessModule> modules, String by) {
        Map<String, Object> before = snapshot(tenant.getBusinessType(), tenant.getModules());
        Set<BusinessModule> enabled = modules.isEmpty() ? EnumSet.noneOf(BusinessModule.class) : EnumSet.copyOf(modules);
        Map<String, Object> after = snapshot(type, enabled);
        if (before.equals(after)) {
            return;
        }
        tenant.changeProfile(type, enabled);
        directory.evict(tenant.getId());
        Map<String, Object> details = new LinkedHashMap<>(after);
        details.put("by", by);
        securityEvents.record(SecurityEvent.TENANT_PROFILE_CHANGED, actorId, null, tenant.getId(), details);
        // En la auditoría del negocio: lo ve el dueño (quién, cuándo, antes y después). Del administrador, sin nombre.
        audit.logIn(tenant.getSchemaName(), "dueño".equals(by) ? actorId : null, "BUSINESS_PROFILE_CHANGED",
                "business", tenant.getId(), before, after);
    }

    private static Map<String, Object> snapshot(BusinessType type, Set<BusinessModule> modules) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("businessType", type.name());
        data.put("modules", BusinessModule.format(modules));
        return data;
    }

    private static BusinessProfile view(Tenant tenant, UUID viewerId) {
        return new BusinessProfile(tenant.getBusinessType(), tenant.getModules().stream().sorted().toList(),
                tenant.isOwnedBy(viewerId));
    }

    private Tenant require(UUID tenantId) {
        return tenants.findById(tenantId).orElseThrow(() -> new NotFoundException("Negocio no encontrado."));
    }
}
