import { ScaleFormat } from '../../core/api/api.models';
import { ean13Check, exampleLabel, formatProblem, valueDigits } from './scale-format';

const weight: ScaleFormat = { enabled: true, prefix: '20', pluDigits: 5, kind: 'WEIGHT', decimals: 3 };

describe('scale-format (fase 8e)', () => {
  it('reparte los 12 dígitos entre prefijo, PLU y valor', () => {
    expect(valueDigits(weight)).toBe(5);
    expect(valueDigits({ prefix: '2', pluDigits: 4 })).toBe(7);
  });

  it('valida como el servidor', () => {
    expect(formatProblem(weight)).toBeNull();
    expect(formatProblem({ ...weight, prefix: '29' })).toContain('29');
    expect(formatProblem({ ...weight, prefix: '2', pluDigits: 3 })).toContain('8 dígitos');
  });

  it('arma una etiqueta de ejemplo válida', () => {
    expect(ean13Check('770123456789')).toBe(7);
    const label = exampleLabel(weight);
    expect(label.parts.slice(0, 3)).toEqual(['20', '00123', '00750']);
    expect(label.code).toBe('200012300750' + ean13Check('200012300750'));
    expect(label.meaning).toContain('0,75 kg');
    const priced = exampleLabel({ enabled: true, prefix: '2', pluDigits: 4, kind: 'PRICE', decimals: 0 });
    expect(priced.parts.slice(0, 3)).toEqual(['2', '0123', '0012500']);
  });
});
