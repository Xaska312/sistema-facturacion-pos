import { featureLabel, includedText, moduleLabel, toggle } from './plan-features';

describe('planes por nivel (decisión 288)', () => {
  it('nombra módulos y funciones y arma el texto de lo incluido', () => {
    expect(moduleLabel('TABLES')).toBe('Mesas');
    expect(featureLabel('DIRECT_PRINT')).toBe('Impresión directa');
    expect(includedText(['CREDIT'], [])).toBe('Fiados');
    expect(includedText(['TABLES'], ['AUDIT'])).toBe('Mesas · Auditoría');
    expect(includedText([], [])).toBe('Lo esencial');
  });

  it('las casillas agregan y quitan sin repetir', () => {
    expect(toggle(['A'], 'B', true)).toEqual(['A', 'B']);
    expect(toggle(['A', 'B'], 'B', true)).toEqual(['A', 'B']);
    expect(toggle(['A', 'B'], 'A', false)).toEqual(['B']);
  });
});
