import { XICONS } from '../../shared/icons/xicons';
import { DOCK_BY_TYPE, DOCK_ROUTES, MENU, dockItems, initials, visibleMenu, withHeadings } from './menu';

describe('visibleMenu', () => {
  it('oculta opciones sin permiso', () => {
    const labels = visibleMenu(() => false).map((m) => m.label);
    expect(labels).toEqual(['Inicio']);
  });

  it('un cajero vende y opera su caja, ve productos, terceros y sucursales, pero nada más de configuración', () => {
    const cashier = new Set(['branches:read', 'products:read', 'parties:read', 'parties:manage', 'inventory:read',
      'sales:create', 'sales:read', 'cash:operate']);
    const labels = visibleMenu((p) => cashier.has(p)).map((m) => m.label);
    expect(labels).toEqual(['Inicio', 'Vender', 'Mi caja', 'Ventas', 'Productos', 'Existencias', 'Movimientos',
      'Clientes', 'Proveedores', 'Sucursales']);
  });

  it('un vendedor sin caja ve la pantalla de venta pero no la caja', () => {
    const seller = new Set(['sales:create', 'sales:read']);
    const labels = visibleMenu((p) => seller.has(p)).map((m) => m.label);
    expect(labels).toEqual(['Inicio', 'Vender', 'Ventas']);
  });

  it('el propietario ve toda la configuración', () => {
    const labels = visibleMenu(() => true).map((m) => m.label);
    expect(labels).toEqual(['Inicio', 'Vender', 'Mesas', 'Mi caja', 'Ventas', 'Fiados', 'Pedidos', 'Cotizaciones', 'Historial de caja',
      'Reportes',
      'Auditoría', 'Productos', 'Adiciones', 'Ajustes de catálogo', 'Existencias', 'Movimientos', 'Clientes', 'Proveedores', 'Sucursales', 'Cajas', 'Usuarios',
      'Roles y permisos', 'Ajustes']);
  });

  it('el contador ve reportes, auditoría, ventas e historial de caja, pero no vende', () => {
    const accountant = new Set(['branches:read', 'settings:read', 'products:read', 'parties:read', 'inventory:read',
      'cash:read', 'cash:audit', 'sales:read', 'reports:read', 'audit:read']);
    const labels = visibleMenu((p) => accountant.has(p)).map((m) => m.label);
    expect(labels).toEqual(['Inicio', 'Ventas', 'Historial de caja', 'Reportes', 'Auditoría', 'Productos', 'Existencias',
      'Movimientos', 'Clientes', 'Proveedores', 'Sucursales', 'Ajustes']);
  });
});

describe('withHeadings', () => {
  it('pone el título de sección solo en el primer elemento del grupo', () => {
    const headings = withHeadings(MENU).map((e) => e.heading);
    expect(headings).toEqual([null, 'Ventas', null, null, null, null, null, null, null, 'Reportes', null, 'Catálogo', null, null, 'Inventario', null,
      'Terceros', null, 'Configuración', null, null, null, null]);
  });
});

describe('MENU', () => {
  it('cada opción tiene icono de PrimeIcons, ícono propio de XASKA y una ruta única', () => {
    expect(MENU.every((m) => /^pi pi-[a-z-]+$/.test(m.icon))).toBeTrue();
    expect(MENU.every((m) => m.glyph in XICONS)).toBeTrue();
    expect(new Set(MENU.map((m) => m.route)).size).toBe(MENU.length);
  });
});

describe('dockItems (decisión 263)', () => {
  it('pone en el dock los módulos del día a día que el usuario puede ver, en orden', () => {
    expect(DOCK_ROUTES.every((route) => MENU.some((m) => m.route === route))).toBeTrue();
    const cashier = new Set(['sales:create', 'sales:read', 'cash:operate', 'products:read']);
    expect(dockItems(visibleMenu((p) => cashier.has(p))).map((m) => m.label))
      .toEqual(['Inicio', 'Vender', 'Mi caja', 'Ventas', 'Productos']);
    expect(dockItems(visibleMenu(() => true)).length).toBe(7);
    expect(dockItems(visibleMenu(() => false)).map((m) => m.label)).toEqual(['Inicio']);
  });

  it('cada tipo de negocio tiene su dock y un módulo apagado no aparece (Fase 12a)', () => {
    for (const routes of Object.values(DOCK_BY_TYPE)) {
      expect(routes.every((route) => MENU.some((m) => m.route === route))).toBeTrue();
      expect(routes.length).toBe(7);
    }
    expect(dockItems(visibleMenu(() => true), 'SERVICES').map((m) => m.label))
      .toEqual(['Inicio', 'Vender', 'Mi caja', 'Ventas', 'Cotizaciones', 'Pedidos', 'Clientes']);
    // Servicios sin cotizaciones: la sesión no trae quotes:read.
    expect(dockItems(visibleMenu((p) => !p.startsWith('quotes:')), 'SERVICES').map((m) => m.label))
      .toEqual(['Inicio', 'Vender', 'Mi caja', 'Ventas', 'Pedidos', 'Clientes']);
    expect(dockItems(visibleMenu(() => true), 'RESTAURANT').map((m) => m.label))
      .toEqual(['Inicio', 'Vender', 'Mesas', 'Comandas', 'Mi caja', 'Ventas', 'Productos']);
    expect(dockItems(visibleMenu(() => true), 'PHARMACY').map((m) => m.label))
      .toEqual(['Inicio', 'Vender', 'Mi caja', 'Ventas', 'Productos', 'Existencias', 'Clientes']);
  });
});

describe('initials', () => {
  it('toma la primera letra del primer y del último nombre', () => {
    expect(initials('Ana María Pérez')).toBe('AP');
    expect(initials('  carlos  ')).toBe('C');
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});
