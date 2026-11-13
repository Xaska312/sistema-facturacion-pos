import { netCost, profitOf, shownCost } from './cost-tax';

describe('cost-tax (decisión 348)', () => {
  it('le quita el IVA al costo escrito con IVA y lo vuelve a mostrar igual', () => {
    expect(netCost(5650, 19)).toBe(4747.9);
    expect(shownCost(4747.9, 19)).toBe(5650);
    expect(netCost(5650, 19, false)).toBe(5650);
    expect(netCost(5650, 0)).toBe(5650);
    expect(shownCost(5650, 0)).toBe(5650);
    expect(shownCost(1000, 5)).toBe(1050);
  });

  it('la leche: 5.650 → 6.800 gana 20,4 % sobre el costo y 16,9 % de margen, con o sin IVA', () => {
    expect(profitOf(6800, 5650, 0, true)).toEqual({ gain: 1150, overCost: 20.4, margin: 16.9 });
    const withIva = profitOf(6800, netCost(5650, 19), 19, true);
    expect(withIva?.overCost).toBe(20.4);
    expect(withIva?.margin).toBe(16.9);
    expect(withIva?.gain).toBe(966);
    expect(profitOf(0, 100, 19, true)).toBeNull();
    expect(profitOf(100, 0, 19, true)).toBeNull();
  });
});
