export type MenuSection = 'Ventas' | 'Reportes' | 'Catálogo' | 'Inventario' | 'Terceros' | 'Configuración';

export interface MenuItem {
  label: string;
  route: string;
  /** Clase de PrimeIcons (p. ej. 'pi pi-home'). */
  icon: string;
  /** Permiso requerido; sin permiso = visible para cualquier miembro. */
  permission?: string;
  /** Grupo del menú lateral. */
  section?: MenuSection;
}

/** Menú lateral. Las opciones de fases siguientes se agregan aquí con su permiso. */
export const MENU: MenuItem[] = [
  { label: 'Inicio', route: '/app', icon: 'pi pi-home' },
  { label: 'Vender', route: '/pos', icon: 'pi pi-shopping-cart', permission: 'sales:create', section: 'Ventas' },
  { label: 'Mi caja', route: '/app/caja', icon: 'pi pi-wallet', permission: 'cash:operate', section: 'Ventas' },
  { label: 'Ventas', route: '/app/ventas', icon: 'pi pi-receipt', permission: 'sales:read', section: 'Ventas' },
  { label: 'Historial de caja', route: '/app/caja/historial', icon: 'pi pi-history', permission: 'cash:read', section: 'Ventas' },
  { label: 'Reportes', route: '/app/reportes', icon: 'pi pi-chart-bar', permission: 'reports:read', section: 'Reportes' },
  { label: 'Productos', route: '/app/productos', icon: 'pi pi-box', permission: 'products:read', section: 'Catálogo' },
  { label: 'Ajustes de catálogo', route: '/app/catalogo', icon: 'pi pi-tags', permission: 'products:manage', section: 'Catálogo' },
  { label: 'Existencias', route: '/app/inventario', icon: 'pi pi-warehouse', permission: 'inventory:read', section: 'Inventario' },
  {
    label: 'Movimientos',
    route: '/app/inventario/movimientos',
    icon: 'pi pi-arrow-right-arrow-left',
    permission: 'inventory:read',
    section: 'Inventario',
  },
  { label: 'Clientes', route: '/app/clientes', icon: 'pi pi-users', permission: 'parties:read', section: 'Terceros' },
  { label: 'Proveedores', route: '/app/proveedores', icon: 'pi pi-truck', permission: 'parties:read', section: 'Terceros' },
  { label: 'Sucursales', route: '/app/sucursales', icon: 'pi pi-building', permission: 'branches:read', section: 'Configuración' },
  { label: 'Cajas', route: '/app/cajas', icon: 'pi pi-calculator', permission: 'cash-registers:manage', section: 'Configuración' },
  { label: 'Usuarios', route: '/app/usuarios', icon: 'pi pi-user', permission: 'members:read', section: 'Configuración' },
  { label: 'Roles y permisos', route: '/app/roles', icon: 'pi pi-shield', permission: 'roles:manage', section: 'Configuración' },
  { label: 'Ajustes', route: '/app/ajustes', icon: 'pi pi-cog', permission: 'settings:read', section: 'Configuración' },
];

/** Rutas con subrutas propias en el menú: solo se marcan activas en su ruta exacta. */
export const EXACT_MATCH_ROUTES: ReadonlySet<string> = new Set(['/app', '/app/inventario', '/app/caja']);

export function visibleMenu(has: (permission: string) => boolean): MenuItem[] {
  return MENU.filter((item) => !item.permission || has(item.permission));
}

/** Agrega el título de sección antes del primer elemento de cada grupo. */
export function withHeadings(items: MenuItem[]): { item: MenuItem; heading: string | null }[] {
  return items.map((item, index) => ({
    item,
    heading: item.section && item.section !== items[index - 1]?.section ? item.section : null,
  }));
}

/** Iniciales para el avatar del menú de usuario ("Ana María Pérez" → "AP"). */
export function initials(fullName: string | null | undefined): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return '?';
  }
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toLocaleUpperCase('es-CO');
}
