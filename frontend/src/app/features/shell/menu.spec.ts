import { MENU, visibleMenu, withHeadings } from './menu';

describe('visibleMenu', () => {
  it('oculta opciones sin permiso', () => {
    const labels = visibleMenu(() => false).map((m) => m.label);
    expect(labels).toEqual(['Inicio']);
  });

  it('un cajero (branches:read) solo ve Inicio y Sucursales, nada más de configuración', () => {
    const cashier = new Set(['branches:read', 'products:read', 'sales:create', 'cash:operate']);
    const labels = visibleMenu((p) => cashier.has(p)).map((m) => m.label);
    expect(labels).toEqual(['Inicio', 'Sucursales']);
  });

  it('el propietario ve toda la configuración', () => {
    const labels = visibleMenu(() => true).map((m) => m.label);
    expect(labels).toEqual(['Inicio', 'Sucursales', 'Cajas', 'Usuarios', 'Roles y permisos', 'Ajustes']);
  });
});

describe('withHeadings', () => {
  it('pone el título de sección solo en el primer elemento del grupo', () => {
    const headings = withHeadings(MENU).map((e) => e.heading);
    expect(headings).toEqual([null, 'Configuración', null, null, null, null]);
  });
});
