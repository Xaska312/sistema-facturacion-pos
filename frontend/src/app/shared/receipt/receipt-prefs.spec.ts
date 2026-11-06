import { printableMm } from './receipt-prefs';

describe('printableMm', () => {
  it('usa el ancho que imprime la cabeza térmica, no el del papel', () => {
    expect(printableMm(80)).toBe(72);
    expect(printableMm(58)).toBe(48);
  });
});
