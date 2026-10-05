import { buildBreadcrumbs } from './breadcrumbs';
import { MENU } from './menu';

describe('buildBreadcrumbs', () => {
  it('en el inicio solo muestra "Inicio" sin enlace', () => {
    expect(buildBreadcrumbs('/app', 'Inicio', MENU)).toEqual([{ label: 'Inicio', route: null }]);
  });

  it('muestra la sección y la opción actual', () => {
    expect(buildBreadcrumbs('/app/sucursales', 'Sucursales', MENU)).toEqual([
      { label: 'Inicio', route: '/app' },
      { label: 'Configuración', route: null },
      { label: 'Sucursales', route: null },
    ]);
  });

  it('no repite la sección cuando se llama igual que la opción', () => {
    expect(buildBreadcrumbs('/app/ventas?page=2', 'Ventas', MENU)).toEqual([
      { label: 'Inicio', route: '/app' },
      { label: 'Ventas', route: null },
    ]);
  });

  it('una subpágina cuelga de la opción de ruta más larga', () => {
    expect(buildBreadcrumbs('/app/inventario/kardex/abc', 'Kardex', MENU)).toEqual([
      { label: 'Inicio', route: '/app' },
      { label: 'Inventario', route: null },
      { label: 'Existencias', route: '/app/inventario' },
      { label: 'Kardex', route: null },
    ]);
    expect(buildBreadcrumbs('/app/caja/historial', 'Historial de caja', MENU).map((c) => c.label)).toEqual([
      'Inicio',
      'Ventas',
      'Historial de caja',
    ]);
  });

  it('no confunde prefijos de texto con subrutas', () => {
    const crumbs = buildBreadcrumbs('/app/cajas', 'Cajas', MENU);
    expect(crumbs.map((c) => c.label)).toEqual(['Inicio', 'Configuración', 'Cajas']);
  });

  it('páginas fuera del menú usan el título de la ruta', () => {
    expect(buildBreadcrumbs('/app/sin-permiso', 'Sin permiso', MENU)).toEqual([
      { label: 'Inicio', route: '/app' },
      { label: 'Sin permiso', route: null },
    ]);
  });
});
