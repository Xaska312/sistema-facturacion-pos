import { slugify } from '../tenants/slugify';

/** Patrón del backend para el código de un rol. */
export const ROLE_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{1,39}$/;

/** Código interno a partir del nombre ("Supervisor de caja" → "SUPERVISOR_DE_CAJA"); el usuario no tiene que inventarlo. */
export function roleCodeFrom(name: string): string {
  const base = slugify(name).toUpperCase().slice(0, 40).replace(/_+$/, '');
  if (ROLE_CODE_PATTERN.test(base)) {
    return base;
  }
  return `ROL_${base}`.slice(0, 40).replace(/_+$/, '');
}
