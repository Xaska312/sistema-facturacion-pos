import { visibleMenu } from './menu';

describe('visibleMenu', () => {
  it('oculta opciones sin permiso', () => {
    const labels = visibleMenu(() => false).map((m) => m.label);
    expect(labels).toEqual(['Inicio']);
  });

  it('muestra opciones con permiso', () => {
    const labels = visibleMenu((p) => p === 'branches:read').map((m) => m.label);
    expect(labels).toContain('Sucursales');
  });
});
