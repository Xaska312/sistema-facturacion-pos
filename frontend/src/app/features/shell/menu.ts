export interface MenuItem {
  label: string;
  route: string;
  /** Permiso requerido; sin permiso = visible para cualquier miembro. */
  permission?: string;
  /** Grupo del menú lateral. */
  section?: 'Configuración';
}

/** Menú lateral. Las opciones de fases siguientes se agregan aquí con su permiso. */
export const MENU: MenuItem[] = [
  { label: 'Inicio', route: '/app' },
  { label: 'Sucursales', route: '/app/sucursales', permission: 'branches:read', section: 'Configuración' },
  { label: 'Cajas', route: '/app/cajas', permission: 'cash-registers:manage', section: 'Configuración' },
  { label: 'Usuarios', route: '/app/usuarios', permission: 'members:read', section: 'Configuración' },
  { label: 'Roles y permisos', route: '/app/roles', permission: 'roles:manage', section: 'Configuración' },
  { label: 'Ajustes', route: '/app/ajustes', permission: 'settings:read', section: 'Configuración' },
];

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
