export interface MenuItem {
  label: string;
  route: string;
  /** Permiso requerido; sin permiso = visible para cualquier miembro. */
  permission?: string;
}

/** Menú lateral. Las opciones de fases siguientes se agregan aquí con su permiso. */
export const MENU: MenuItem[] = [
  { label: 'Inicio', route: '/app' },
  { label: 'Sucursales', route: '/app/sucursales', permission: 'branches:read' },
];

export function visibleMenu(has: (permission: string) => boolean): MenuItem[] {
  return MENU.filter((item) => !item.permission || has(item.permission));
}
