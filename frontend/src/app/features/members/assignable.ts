import { Role } from '../../core/api/api.models';

/**
 * Roles que el usuario actual puede asignar: nunca OWNER y solo aquellos cuyos permisos tiene.
 * Es solo ayuda visual: el backend aplica la misma regla.
 */
export function assignableRoles(roles: Role[], myPermissions: ReadonlySet<string>): Role[] {
  return roles.filter((role) => role.editable && role.permissions.every((p) => myPermissions.has(p)));
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
