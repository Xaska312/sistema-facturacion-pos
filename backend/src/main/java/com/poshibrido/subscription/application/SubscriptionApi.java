package com.poshibrido.subscription.application;

import com.poshibrido.tenancy.application.TenantRef;

import java.util.UUID;

/** Lo que otros módulos necesitan de la suscripción. */
public interface SubscriptionApi {

    /**
     * Inicia la suscripción de un negocio recién creado, dentro de la transacción que lo registra: con código de
     * activación, el plan y los meses del código; sin código, la prueba gratis (solo el primer negocio de la cuenta;
     * si no, 422 {@code ACTIVATION_CODE_REQUIRED}).
     */
    void startForNewTenant(UUID tenantId, UUID ownerId, String activationCode);

    /** Reintento de un negocio que falló al crearse: la prueba cuenta desde hoy. */
    void restartTrialOnRetry(UUID tenantId);

    /** Vencida (prueba terminada o gracia agotada): solo lectura. */
    boolean blocksWrites(UUID tenantId);

    /** 422 si el plan no admite otra sucursal activa. */
    void requireCanAddBranch(TenantRef tenant);

    /** 422 si el plan no admite otro usuario (miembros activos + invitaciones pendientes). */
    void requireCanAddUser(TenantRef tenant);
}
