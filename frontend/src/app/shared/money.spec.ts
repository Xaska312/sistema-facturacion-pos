import { formatCompactCop, formatCop, formatPercent, formatQuantity } from './money';

describe('formatCop', () => {
  it('muestra pesos sin decimales', () => {
    const text = formatCop(2500);
    expect(text).toContain('2.500');
    expect(text).not.toContain(',');
  });

  it('muestra guion si no hay valor', () => {
    expect(formatCop(null)).toBe('—');
  });
});

describe('formatQuantity', () => {
  it('usa coma decimal', () => {
    expect(formatQuantity(0.5)).toBe('0,5');
    expect(formatQuantity(24)).toBe('24');
  });
});

describe('formatPercent', () => {
  it('usa coma decimal y el símbolo de porcentaje', () => {
    expect(formatPercent(67.45)).toBe('67,45 %');
    expect(formatPercent(0)).toBe('0 %');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatCompactCop', () => {
  it('abrevia millones y miles para los ejes', () => {
    expect(formatCompactCop(1250000)).toBe('$ 1,3 M');
    expect(formatCompactCop(85000)).toBe('$ 85 mil');
    expect(formatCompactCop(1500)).toBe('$ 1,5 mil');
    expect(formatCompactCop(0)).toBe('$ 0');
    expect(formatCompactCop(-2500000)).toBe('-$ 2,5 M');
    expect(formatCompactCop(null)).toBe('—');
  });
});
