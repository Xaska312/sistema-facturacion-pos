import { MENU, visibleMenu, withHeadings } from './menu';

describe('visibleMenu', () => {
  it('oculta opciones sin permiso', () => {
    const labels = visibleMenu(() => false).map((m) => m.label);
    expect(labels).toEqual(['Inicio']);
  });

  it('un cajero ve productos, terceros y sucursales, pero nada más de configuración', () => {
    const cashier = new Set(['branches:read', 'products:read', 'parties:read', 'parties:manage', 'inventory:read',
      'sales:create', 'cash:operate']);
    const labels = visibleMenu((p) => cashier.has(p)).map((m) => m.label);
    expect(labels).toEqual(['Inicio', 'Productos', 'Existencias', 'Movimientos', 'Clientes', 'Proveedores', 'Sucursales']);
  });

  it('el propietario ve toda la configuración', () => {
    const labels = visibleMenu(() => true).map((m) => m.label);
    expect(labels).toEqual(['Inicio', 'Productos', 'Ajustes de catálogo', 'Existencias', 'Movimientos', 'Clientes',
      'Proveedores', 'Sucursales', 'Cajas', 'Usuarios', 'Roles y permisos', 'Ajustes']);
  });
});

describe('withHeadings', () => {
  it('pone el título de sección solo en el primer elemento del grupo', () => {
    const headings = withHeadings(MENU).map((e) => e.heading);
    expect(headings).toEqual([null, 'Catálogo', null, 'Inventario', null, 'Terceros', null, 'Configuración', null, null,
      null, null]);
  });
});
