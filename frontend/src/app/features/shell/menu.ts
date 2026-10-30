import { BusinessType } from '../../core/api/api.models';
import { XIconName } from '../../shared/icons/xicons';

export type MenuSection = 'Ventas' | 'Reportes' | 'Catálogo' | 'Inventario' | 'Terceros' | 'Configuración';

export interface MenuItem {
  label: string;
  route: string;
  /** Clase de PrimeIcons (p. ej. 'pi pi-home'): migas de pan y lugares sin el ícono propio. */
  icon: string;
  /** Ícono propio de XASKA (identidad, decisión 263). */
  glyph: XIconName;
  /** Permiso requerido; sin permiso = visible para cualquier miembro. */
  permission?: string;
  /** Grupo del menú lateral. */
  section?: MenuSection;
}

/** Menú lateral. Las opciones de fases siguientes se agregan aquí con su permiso. */
export const MENU: MenuItem[] = [
  { label: 'Inicio', route: '/app', icon: 'pi pi-home', glyph: 'home' },
  { label: 'Vender', route: '/pos', icon: 'pi pi-shopping-cart', glyph: 'sell', permission: 'sales:create', section: 'Ventas' },
  { label: 'Mi caja', route: '/app/caja', icon: 'pi pi-wallet', glyph: 'cash', permission: 'cash:operate', section: 'Ventas' },
  { label: 'Ventas', route: '/app/ventas', icon: 'pi pi-receipt', glyph: 'sales', permission: 'sales:read', section: 'Ventas' },
  { label: 'Fiados', route: '/app/fiados', icon: 'pi pi-book', glyph: 'credit', permission: 'credit:read', section: 'Ventas' },
  { label: 'Pedidos', route: '/app/pedidos', icon: 'pi pi-calendar', glyph: 'orders', permission: 'orders:read', section: 'Ventas' },
  { label: 'Cotizaciones', route: '/app/cotizaciones', icon: 'pi pi-file-edit', glyph: 'quotes', permission: 'quotes:read', section: 'Ventas' },
  { label: 'Historial de caja', route: '/app/caja/historial', icon: 'pi pi-history', glyph: 'cash-history', permission: 'cash:read', section: 'Ventas' },
  { label: 'Reportes', route: '/app/reportes', icon: 'pi pi-chart-bar', glyph: 'reports', permission: 'reports:read', section: 'Reportes' },
  { label: 'Auditoría', route: '/app/auditoria', icon: 'pi pi-eye', glyph: 'audit', permission: 'audit:read', section: 'Reportes' },
  { label: 'Productos', route: '/app/productos', icon: 'pi pi-box', glyph: 'products', permission: 'products:read', section: 'Catálogo' },
  { label: 'Ajustes de catálogo', route: '/app/catalogo', icon: 'pi pi-tags', glyph: 'catalog', permission: 'products:manage', section: 'Catálogo' },
  { label: 'Existencias', route: '/app/inventario', icon: 'pi pi-warehouse', glyph: 'stock', permission: 'inventory:read', section: 'Inventario' },
  {
    label: 'Movimientos',
    route: '/app/inventario/movimientos',
    icon: 'pi pi-arrow-right-arrow-left',
    glyph: 'movements',
    permission: 'inventory:read',
    section: 'Inventario',
  },
  { label: 'Clientes', route: '/app/clientes', icon: 'pi pi-users', glyph: 'customers', permission: 'parties:read', section: 'Terceros' },
  { label: 'Proveedores', route: '/app/proveedores', icon: 'pi pi-truck', glyph: 'suppliers', permission: 'parties:read', section: 'Terceros' },
  { label: 'Sucursales', route: '/app/sucursales', icon: 'pi pi-building', glyph: 'branches', permission: 'branches:read', section: 'Configuración' },
  { label: 'Cajas', route: '/app/cajas', icon: 'pi pi-calculator', glyph: 'registers', permission: 'cash-registers:manage', section: 'Configuración' },
  { label: 'Usuarios', route: '/app/usuarios', icon: 'pi pi-user', glyph: 'users', permission: 'members:read', section: 'Configuración' },
  { label: 'Roles y permisos', route: '/app/roles', icon: 'pi pi-shield', glyph: 'roles', permission: 'roles:manage', section: 'Configuración' },
  { label: 'Ajustes', route: '/app/ajustes', icon: 'pi pi-cog', glyph: 'settings', permission: 'settings:read', section: 'Configuración' },
];

/**
 * Dock de la parte de abajo (identidad, decisión 263): los módulos del día a día, en este orden, si el usuario tiene
 * permiso. Lo demás está en "Todo". Cada tipo de negocio tiene su dock (Fase 12a, decisión 267); un módulo apagado no
 * sale porque sus permisos no están en la sesión.
 */
export const DOCK_ROUTES: readonly string[] = ['/app', '/pos', '/app/caja', '/app/ventas', '/app/fiados', '/app/pedidos',
  '/app/productos'];

export const DOCK_BY_TYPE: Readonly<Record<BusinessType, readonly string[]>> = {
  RETAIL: DOCK_ROUTES,
  SERVICES: ['/app', '/pos', '/app/caja', '/app/ventas', '/app/cotizaciones', '/app/pedidos', '/app/clientes'],
  // La 12b le pondrá Mesas.
  RESTAURANT: ['/app', '/pos', '/app/caja', '/app/ventas', '/app/productos', '/app/pedidos', '/app/fiados'],
  PHARMACY: ['/app', '/pos', '/app/caja', '/app/ventas', '/app/productos', '/app/inventario', '/app/clientes'],
};

export function dockItems(visible: readonly MenuItem[], type: BusinessType = 'RETAIL'): MenuItem[] {
  return DOCK_BY_TYPE[type].map((route) => visible.find((item) => item.route === route))
    .filter((item): item is MenuItem => item !== undefined);
}

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
