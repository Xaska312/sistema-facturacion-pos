import { MenuItem } from './menu';

export interface Crumb {
  label: string;
  /** Ruta del enlace; null = texto sin enlace (sección o página actual). */
  route: string | null;
}

/**
 * Migas de pan a partir de la URL y del menú: Inicio › sección › opción del menú › página actual.
 * La opción del menú es la de ruta más larga que contiene a la URL (p. ej. el kardex cuelga de Existencias).
 */
export function buildBreadcrumbs(url: string, pageTitle: string | null, menu: readonly MenuItem[]): Crumb[] {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path === '/app') {
    return [{ label: 'Inicio', route: null }];
  }
  const crumbs: Crumb[] = [{ label: 'Inicio', route: '/app' }];
  const item = menu
    .filter((m) => m.route !== '/app' && (path === m.route || path.startsWith(`${m.route}/`)))
    .sort((a, b) => b.route.length - a.route.length)[0];

  if (!item) {
    crumbs.push({ label: pageTitle ?? 'Página', route: null });
    return crumbs;
  }
  if (item.section && item.section !== item.label) {
    crumbs.push({ label: item.section, route: null });
  }
  if (item.route === path) {
    crumbs.push({ label: item.label, route: null });
  } else {
    crumbs.push({ label: item.label, route: item.route });
    crumbs.push({ label: pageTitle ?? 'Detalle', route: null });
  }
  return crumbs;
}
