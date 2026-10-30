import { Role } from '../../core/api/api.models';
import { moduleAuthority, permissionModule } from '../../shared/business-types';

/**
 * Roles que el usuario actual puede asignar: nunca OWNER y solo aquellos cuyos permisos tiene. Los permisos de un
 * módulo apagado no cuentan (no están en la sesión de nadie; el backend los compara con el rol real): así el Mesero se
 * puede asignar en un negocio con Mesas pero sin Cocina (Fase 12b-3).
 * Es solo ayuda visual: el backend aplica la misma regla.
 */
export function assignableRoles(roles: Role[], myPermissions: ReadonlySet<string>): Role[] {
  const counts = (p: string): boolean => {
    const module = permissionModule(p);
    return myPermissions.has(p) || (module !== null && !myPermissions.has(moduleAuthority(module)));
  };
  return roles.filter((role) => role.editable && role.permissions.every(counts));
}

/** Alterna un valor dentro de un conjunto inmutable. */
export function toggleIn(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}
