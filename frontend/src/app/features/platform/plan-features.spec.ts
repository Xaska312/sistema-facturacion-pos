import { PLAN_ONLY_FEATURES, featureLabel, includedText, moduleLabel, toggle } from './plan-features';

describe('planes por nivel (decisión 288)', () => {
  it('nombra módulos y funciones y arma el texto de lo incluido', () => {
    expect(moduleLabel('TABLES')).toBe('Mesas');
    expect(featureLabel('DIRECT_PRINT')).toBe('Impresión directa');
    expect(includedText(['CREDIT'], [])).toBe('Fiados');
    expect(includedText(['TABLES'], ['AUDIT'])).toBe('Mesas · Auditoría');
    expect(includedText([], [])).toBe('Lo esencial');
  });

  it('XASKA IA es un adicional: no se ofrece al editar un plan (decisión 295)', () => {
    expect(featureLabel('AI')).toBe('XASKA IA');
    expect(PLAN_ONLY_FEATURES.map((f) => f.code)).not.toContain('AI');
    expect(PLAN_ONLY_FEATURES.map((f) => f.code)).toContain('PURCHASES');
  });

  it('las casillas agregan y quitan sin repetir', () => {
    expect(toggle(['A'], 'B', true)).toEqual(['A', 'B']);
    expect(toggle(['A', 'B'], 'B', true)).toEqual(['A', 'B']);
    expect(toggle(['A', 'B'], 'A', false)).toEqual(['B']);
  });
});
