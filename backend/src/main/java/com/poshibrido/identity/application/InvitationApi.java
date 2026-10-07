package com.poshibrido.identity.application;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Almacén de invitaciones (schema platform). Las reglas del negocio (roles válidos, permisos
 * del que invita) las aplica el módulo de acceso antes de llamar aquí.
 */
public interface InvitationApi {

    /** Invitación creada y el token en claro (se muestra una sola vez). */
    record Created(InvitationView invitation, String rawToken) {
    }

    /** Lanza 409 si ya hay una invitación pendiente para ese correo en el negocio. */
    Created create(UUID tenantId, String email, Set<UUID> roleIds, Set<UUID> branchIds, UUID invitedBy);

    /**
     * Reenvío: revoca la invitación pendiente y crea otra igual con un enlace nuevo (solo se guarda el hash del
     * token, así que el enlace anterior no se puede volver a mostrar). El enlace anterior deja de servir.
     */
    Created reissue(UUID tenantId, UUID invitationId, UUID invitedBy);

    Page<InvitationView> listForTenant(UUID tenantId, boolean onlyPending, Pageable pageable);

    /** Revoca una invitación pendiente del negocio (404 si no es de ese negocio). */
    InvitationView revoke(UUID tenantId, UUID invitationId);

    /** Busca por token en claro. Vacío si no existe. */
    Optional<InvitationView> findByToken(String rawToken);

    /** Marca como aceptada. Debe ejecutarse dentro de una transacción. */
    void markAccepted(UUID invitationId, UUID userId);
}
