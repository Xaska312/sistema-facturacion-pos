package com.poshibrido.access.application;

import com.poshibrido.access.domain.Role;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.domain.BusinessModule;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Set;
import java.util.TreeSet;

/**
 * Evita la escalada de privilegios: nadie puede otorgar, quitar ni editar permisos que no tiene.
 * Los permisos del actor se toman de su token (se recalculan en cada renovación, máx. 15 min).
 *
 * <p>Con un módulo apagado (Fase 12a) sus permisos no están en el token: para esos se miran los roles del actor en la
 * base, así el dueño sigue asignando el rol Cajero (con permisos de fiado) sin que nadie gane permisos que no tiene.
 */
@Component
@RequiredArgsConstructor
public class PrivilegeGuard {

    private final AccessApi access;

    /** El actor debe tener todos los permisos indicados. */
    public void requireHolds(Collection<String> permissionCodes, String action) {
        Set<String> actor = CurrentActor.permissions();
        Set<String> missing = new TreeSet<>(permissionCodes);
        missing.removeAll(actor);
        if (missing.stream().anyMatch(p -> isOfDisabledModule(p, actor))) {
            Set<String> fromRoles = Set.copyOf(access.permissionsOf(CurrentTenant.require().schema(),
                    CurrentActor.requireUserId()));
            missing.removeIf(p -> isOfDisabledModule(p, actor) && fromRoles.contains(p));
        }
        if (!missing.isEmpty()) {
            throw new ForbiddenException("No puedes " + action + " porque incluye permisos que tú no tienes: "
                    + String.join(", ", missing) + ".");
        }
    }

    /** Roles que el actor puede asignar: nunca OWNER, y solo con permisos que el actor tiene. */
    public void requireCanAssign(Collection<Role> roles) {
        for (Role role : roles) {
            if (role.isOwner()) {
                throw new ForbiddenException("El rol Propietario no se puede asignar.");
            }
            requireHolds(role.getPermissionCodes(), "asignar el rol " + role.getName());
        }
    }

    /** Permiso de un módulo que está apagado en este negocio (su autoridad {@code module:…} no está en el token). */
    private static boolean isOfDisabledModule(String permission, Set<String> actor) {
        return BusinessModule.owning(permission).map(m -> !actor.contains(m.authority())).orElse(false);
    }
}
