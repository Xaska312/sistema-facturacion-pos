package com.poshibrido.access.application;

import com.poshibrido.access.domain.Role;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.security.CurrentActor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Set;
import java.util.TreeSet;

/**
 * Evita la escalada de privilegios: nadie puede otorgar, quitar ni editar permisos que no tiene.
 * Los permisos del actor se toman de su token (se recalculan en cada renovación, máx. 15 min).
 */
@Component
public class PrivilegeGuard {

    /** El actor debe tener todos los permisos indicados. */
    public void requireHolds(Collection<String> permissionCodes, String action) {
        Set<String> actor = CurrentActor.permissions();
        Set<String> missing = new TreeSet<>(permissionCodes);
        missing.removeAll(actor);
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
}
