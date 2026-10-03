import { CASH_MOVEMENT_LABEL, differenceLabel } from './labels';

describe('etiquetas de caja', () => {
  it('nombra cada tipo de movimiento', () => {
    expect(CASH_MOVEMENT_LABEL.WITHDRAWAL).toBe('Retiro');
    expect(Object.keys(CASH_MOVEMENT_LABEL).length).toBe(5);
  });

  it('describe la diferencia del arqueo', () => {
    expect(differenceLabel(-1000)).toBe('Faltante');
    expect(differenceLabel(500)).toBe('Sobrante');
    expect(differenceLabel(0)).toBe('Cuadrada');
    expect(differenceLabel(null)).toBe('—');
  });
});
