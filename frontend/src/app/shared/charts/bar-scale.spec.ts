import { barPercents } from './bar-scale';

describe('barPercents', () => {
  it('escala respecto al máximo', () => {
    expect(barPercents([50, 100, 25])).toEqual([50, 100, 25]);
  });

  it('nunca deja invisible una barra positiva y no dibuja negativos', () => {
    expect(barPercents([1, 1000, -5, 0])).toEqual([2, 100, 0, 0]);
  });

  it('sin datos, todo en cero', () => {
    expect(barPercents([0, 0])).toEqual([0, 0]);
    expect(barPercents([])).toEqual([]);
  });
});
