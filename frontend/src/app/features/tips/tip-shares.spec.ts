import { shareTips } from './tip-shares';

describe('reparto de propinas (Fase 12b-5)', () => {
  it('reparte en pesos enteros y los que sobran van a los primeros', () => {
    expect(shareTips(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(shareTips(50000, 2)).toEqual([25000, 25000]);
    expect(shareTips(0, 2)).toEqual([0, 0]);
    expect(shareTips(1000, 0)).toEqual([]);
  });
});
