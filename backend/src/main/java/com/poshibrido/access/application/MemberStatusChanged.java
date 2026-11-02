package com.poshibrido.access.application;

import java.util.UUID;

/**
 * Un miembro del negocio quedó activo o desactivado (decisión 277). Se publica dentro de la transacción del cambio;
 * los oyentes actúan después del commit: {@link ActiveMembers} olvida lo que tenía guardado y los avisos en tiempo real
 * cierran las conexiones de quien quedó desactivado.
 */
public record MemberStatusChanged(UUID tenantId, UUID memberId, boolean active) {
}
