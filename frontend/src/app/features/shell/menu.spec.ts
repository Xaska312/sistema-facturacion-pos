import { MENU, initials, visibleMenu, withHeadings } from './menu';

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
    expect(labels).toEqual(['Inicio', 'Vender', 'Mi caja', 'Ventas', 'Historial de caja', 'Reportes', 'Auditoría',
      'Productos', 'Ajustes de catálogo', 'Existencias', 'Movimientos', 'Clientes', 'Proveedores', 'Sucursales', 'Cajas', 'Usuarios',
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
    expect(headings).toEqual([null, 'Ventas', null, null, null, 'Reportes', null, 'Catálogo', null, 'Inventario', null,
      'Terceros', null, 'Configuración', null, null, null, null]);
  });
});

describe('MENU', () => {
  it('cada opción tiene icono de PrimeIcons y una ruta única', () => {
    expect(MENU.every((m) => /^pi pi-[a-z-]+$/.test(m.icon))).toBeTrue();
    expect(new Set(MENU.map((m) => m.route)).size).toBe(MENU.length);
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
