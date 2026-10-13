import { BRAND_PALETTES, DEFAULT_BRAND, activeBrand, applyBrandColor } from './brand-palettes';

describe('brand-palettes', () => {
  afterEach(() => applyBrandColor(null, document.createElement('html')));

  it('índigo, el color de XASKA, es el de por defecto y va primero', () => {
    expect(DEFAULT_BRAND).toBe('indigo');
    expect(BRAND_PALETTES[0].id).toBe('indigo');
    expect(BRAND_PALETTES.some((p) => p.id === 'turquesa')).toBeTrue();
  });

  it('aplica el color en <html> y avisa a las gráficas', () => {
    const root = document.createElement('html');
    applyBrandColor('turquesa', root);
    expect(root.dataset['brand']).toBe('turquesa');
    expect(activeBrand()).toBe('turquesa');

    // El de por defecto vive en :root, sin atributo.
    applyBrandColor('indigo', root);
    expect(root.dataset['brand']).toBeUndefined();
    expect(activeBrand()).toBe('indigo');

    applyBrandColor('rosa', root);
    applyBrandColor('no-existe', root);
    expect(root.dataset['brand']).toBeUndefined();
    expect(activeBrand()).toBe('indigo');
  });
});
