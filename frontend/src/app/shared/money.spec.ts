import { formatCop, formatQuantity } from './money';

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
