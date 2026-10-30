package com.poshibrido.tenancy.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.tenancy.application.BusinessProfileService.BusinessProfile;
import com.poshibrido.tenancy.domain.BusinessModule;
import com.poshibrido.tenancy.domain.BusinessType;
import com.poshibrido.tenancy.domain.Tenant;
import com.poshibrido.tenancy.infrastructure.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Fase 12a (decisión 267): solo el dueño cambia el tipo y los módulos; los tipos "Pronto" los asigna la plataforma. */
class BusinessProfileServiceTest {

    private final UUID owner = UUID.randomUUID();
    private final TenantRepository tenants = mock(TenantRepository.class);
    private final TenantDirectory directory = mock(TenantDirectory.class);
    private final SecurityEventLogger events = mock(SecurityEventLogger.class);
    private final AuditLogger audit = mock(AuditLogger.class);
    private final BusinessProfileService service = new BusinessProfileService(tenants, directory, events, audit);
    private Tenant tenant;

    @BeforeEach
    void setUp() {
        tenant = Tenant.startProvisioning("tienda_x", "Tienda X S.A.S.", "Tienda X", BusinessType.RETAIL, owner);
        when(tenants.findById(tenant.getId())).thenReturn(Optional.of(tenant));
    }

    @Test
    void ownerChangesTypeAndModulesAndItIsRecorded() {
        BusinessProfile result = service.change(tenant.getId(), owner, BusinessType.SERVICES,
                List.of(BusinessModule.QUOTES, BusinessModule.CREDIT));

        assertThat(result.businessType()).isEqualTo(BusinessType.SERVICES);
        assertThat(result.modules()).containsExactly(BusinessModule.CREDIT, BusinessModule.QUOTES);
        assertThat(result.canEdit()).isTrue();
        verify(directory).evict(tenant.getId());
        verify(events).record(eq(SecurityEvent.TENANT_PROFILE_CHANGED), eq(owner), any(), eq(tenant.getId()), anyMap());
        verify(audit).logIn(eq("t_tienda_x"), eq(owner), eq("BUSINESS_PROFILE_CHANGED"), eq("business"),
                eq(tenant.getId()), anyMap(), anyMap());
    }

    @Test
    void sameProfileRecordsNothing() {
        service.change(tenant.getId(), owner, BusinessType.RETAIL, BusinessType.RETAIL.defaultModules());
        verify(events, never()).record(any(), any(), any(), any(), anyMap());
        verify(audit, never()).logIn(anyString(), any(), anyString(), anyString(), any(), anyMap(), anyMap());
    }

    @Test
    void onlyTheOwnerChangesIt() {
        UUID admin = UUID.randomUUID();
        assertThatThrownBy(() -> service.change(tenant.getId(), admin, BusinessType.SERVICES, List.of()))
                .isInstanceOf(ForbiddenException.class);
        assertThat(service.profile(tenant.getId(), admin).canEdit()).isFalse();
        assertThat(tenant.getBusinessType()).isEqualTo(BusinessType.RETAIL);
    }

    @Test
    void ownerCannotPickAComingSoonTypeButKeepsAPilotOne() {
        assertThatThrownBy(() -> service.change(tenant.getId(), owner, BusinessType.RESTAURANT, List.of()))
                .isInstanceOf(BusinessRuleException.class);

        service.assignByPlatform(tenant.getId(), UUID.randomUUID(), BusinessType.RESTAURANT);
        assertThat(tenant.getModules()).containsExactlyInAnyOrder(BusinessModule.CREDIT, BusinessModule.ORDERS,
                BusinessModule.MODIFIERS);

        BusinessProfile kept = service.change(tenant.getId(), owner, BusinessType.RESTAURANT,
                List.of(BusinessModule.ORDERS));
        assertThat(kept.businessType()).isEqualTo(BusinessType.RESTAURANT);
        assertThat(kept.modules()).containsExactly(BusinessModule.ORDERS);
    }

    @Test
    void platformAssignmentIsNotAttributedToAMemberInTheBusinessAudit() {
        UUID admin = UUID.randomUUID();
        service.assignByPlatform(tenant.getId(), admin, BusinessType.PHARMACY);
        verify(events).record(eq(SecurityEvent.TENANT_PROFILE_CHANGED), eq(admin), any(), eq(tenant.getId()), anyMap());
        verify(audit).logIn(eq("t_tienda_x"), eq(null), eq("BUSINESS_PROFILE_CHANGED"), eq("business"),
                eq(tenant.getId()), anyMap(), anyMap());
    }
}
