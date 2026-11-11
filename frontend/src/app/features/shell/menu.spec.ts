import { XICONS } from '../../shared/icons/xicons';
import { DOCK_BY_TYPE, DOCK_ROUTES, MENU, dockItems, initials, isFloorOnly, visibleMenu, withHeadings } from './menu';

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
    expect(labels).toEqual(['Inicio', 'Vender', 'Mesas', 'Cocina', 'Comandas', 'Mi caja', 'Ventas', 'Fiados', 'Pedidos', 'Cotizaciones', 'Historial de caja',
      'Reportes', 'Estado de resultados', 'Gastos', 'Retenciones',
      'Libro de dispensación', 'Propinas', 'Auditoría', 'Productos', 'Adiciones', 'Ajustes de catálogo', 'Existencias', 'Movimientos', 'Vencimientos', 'Temperatura y calidad', 'Compras', 'Qué comprar', 'Cuentas por pagar', 'Clientes', 'Proveedores', 'Sucursales', 'Cajas', 'Usuarios',
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
    expect(headings).toEqual([null, 'Ventas', null, null, null, null, null, null, null, null, null, 'Reportes', null, null, null, null, null, null, 'Catálogo', null, null, 'Inventario', null, null, null, null, null, null,
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
      .toEqual(['Inicio', 'Vender', 'Mesas', 'Cocina', 'Comandas', 'Mi caja', 'Ventas']);
    // La cocina en un Comercio con mesas: su pantalla entra al dock (Fase 12b-4).
    const cook = new Set(['branches:read', 'kitchen:view']);
    expect(dockItems(visibleMenu((p) => cook.has(p)), 'RETAIL').map((m) => m.label)).toEqual(['Inicio', 'Cocina']);
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

describe('menú del mesero (decisión 293)', () => {
  const waiter = new Set(['branches:read', 'products:read', 'tables:operate', 'kitchen:send', 'module:tables']);
  const has = (set: Set<string>) => (p: string) => set.has(p);

  it('quien atiende mesas sin vender ni caja solo ve Mesas', () => {
    expect(isFloorOnly(has(waiter))).toBeTrue();
    expect(visibleMenu(has(waiter)).map((m) => m.route)).toEqual(['/app/mesas']);
    expect(dockItems(visibleMenu(has(waiter)), 'RESTAURANT').map((m) => m.route)).toEqual(['/app/mesas']);
  });

  it('si el dueño le da Vender o la caja, vuelve el menú completo', () => {
    const seller = new Set([...waiter, 'sales:create']);
    expect(isFloorOnly(has(seller))).toBeFalse();
    expect(visibleMenu(has(seller)).map((m) => m.route)).toContain('/pos');
    expect(visibleMenu(has(seller)).map((m) => m.route)).toContain('/app/productos');
    expect(isFloorOnly(has(new Set([...waiter, 'cash:operate'])))).toBeFalse();
  });

  it('la cocina y quien no atiende mesas no cambian', () => {
    expect(isFloorOnly(has(new Set(['branches:read', 'kitchen:view'])))).toBeFalse();
    expect(isFloorOnly(has(new Set(['products:read'])))).toBeFalse();
  });
});
