/**
 * Lo que el usuario puede hacer, en lenguaje natural, a partir de sus permisos (reemplaza la lista de códigos
 * técnicos del inicio). Si tiene el permiso de administrar, no se repite el de consultar.
 */
interface CapabilityRule {
  permission: string;
  text: string;
  /** Si el usuario tiene este otro permiso, esta capacidad ya queda incluida en él. */
  coveredBy?: string;
}

const RULES: readonly CapabilityRule[] = [
  { permission: 'sales:create', text: 'vender' },
  { permission: 'cash:operate', text: 'abrir, mover y cerrar caja' },
  { permission: 'sales:read', text: 'consultar las ventas' },
  { permission: 'sales:void', text: 'anular ventas' },
  { permission: 'sales:discount', text: 'dar descuentos por encima del límite' },
  { permission: 'cash:read', text: 'ver el historial de caja' },
  { permission: 'cash:audit', text: 'ver las diferencias de los arqueos' },
  { permission: 'reports:read', text: 'ver el tablero y los reportes' },
  { permission: 'products:manage', text: 'administrar productos, categorías y precios' },
  { permission: 'products:read', text: 'consultar productos', coveredBy: 'products:manage' },
  { permission: 'inventory:adjust', text: 'registrar saldos iniciales, ajustes y conteos' },
  { permission: 'inventory:transfer', text: 'trasladar mercancía entre sucursales' },
  { permission: 'inventory:read', text: 'consultar existencias y kardex' },
  { permission: 'parties:manage', text: 'registrar clientes y proveedores' },
  { permission: 'parties:read', text: 'consultar clientes y proveedores', coveredBy: 'parties:manage' },
  { permission: 'branches:manage', text: 'crear y editar sucursales' },
  { permission: 'cash-registers:manage', text: 'crear y editar cajas' },
  { permission: 'members:manage', text: 'invitar usuarios y asignarles roles' },
  { permission: 'members:read', text: 'ver los usuarios del negocio', coveredBy: 'members:manage' },
  { permission: 'roles:manage', text: 'definir roles y permisos' },
  { permission: 'settings:manage', text: 'cambiar los ajustes del negocio' },
  { permission: 'settings:read', text: 'consultar los ajustes del negocio', coveredBy: 'settings:manage' },
];

/** Capacidades en el orden de la tabla (lo más usado primero). */
export function describeCapabilities(permissions: ReadonlySet<string>): string[] {
  return RULES
    .filter((r) => permissions.has(r.permission) && !(r.coveredBy && permissions.has(r.coveredBy)))
    .map((r) => r.text);
}

/** "a", "a y b", "a, b y c". */
export function joinSpanish(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** Saludo según la hora local: hasta las 11:59 "Buenos días", hasta las 18:59 "Buenas tardes". */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Buenos días';
  }
  return hour < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/** "Ana María Pérez" → "Ana". */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}

export interface QuickAction {
  label: string;
  hint: string;
  route: string;
  icon: string;
  permission: string;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  { label: 'Vender', hint: 'Abrir la pantalla de venta', route: '/pos', icon: 'pi pi-shopping-cart', permission: 'sales:create' },
  { label: 'Mi caja', hint: 'Abrir, mover o cerrar', route: '/app/caja', icon: 'pi pi-wallet', permission: 'cash:operate' },
  { label: 'Productos', hint: 'Crear o importar', route: '/app/productos', icon: 'pi pi-box', permission: 'products:manage' },
  { label: 'Existencias', hint: 'Qué hay en cada sucursal', route: '/app/inventario', icon: 'pi pi-warehouse', permission: 'inventory:read' },
  { label: 'Ventas', hint: 'Buscar, reimprimir o anular', route: '/app/ventas', icon: 'pi pi-receipt', permission: 'sales:read' },
  { label: 'Reportes', hint: 'Ventas, productos e inventario', route: '/app/reportes', icon: 'pi pi-chart-bar', permission: 'reports:read' },
  { label: 'Clientes', hint: 'Registrar o buscar', route: '/app/clientes', icon: 'pi pi-users', permission: 'parties:read' },
];

/** Accesos del inicio según los permisos (máximo 6, en orden de uso). */
export function quickActions(permissions: ReadonlySet<string>): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => permissions.has(a.permission)).slice(0, 6);
}
