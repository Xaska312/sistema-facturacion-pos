import { ChargePart } from '../../core/api/dining.api';
import { decodeParts, encodeParts } from './tab-lines';
import { equalParts, suggestedTip, tipAmount } from './tip';

describe('cobro de mesas (Fase 12b-5)', () => {
  it('sugiere la propina sobre la base sin impuestos, en pesos enteros', () => {
    expect(suggestedTip(84034, 10)).toBe(8403);
    expect(suggestedTip(50000, 0)).toBe(0);
    expect(tipAmount('suggested', 50000, 10, null)).toBe(5000);
    expect(tipAmount('custom', 50000, 10, 3500.4)).toBe(3500);
    expect(tipAmount('none', 50000, 10, 3500)).toBe(0);
  });

  it('divide en partes iguales y la última se lleva el redondeo', () => {
    expect(equalParts(100000, 3)).toEqual([33333, 33333, 33334]);
    expect(equalParts(60000, 2)).toEqual([30000, 30000]);
  });

  it('lleva las partes a cobrar en la dirección de Vender', () => {
    const parts: ChargePart[] = [{ itemId: 'a', quantity: 1 }, { itemId: 'b', quantity: 2 }, { itemId: 'c', quantity: 0 }];
    expect(encodeParts(parts)).toBe('a:1,b:2');
    expect(decodeParts('a:1,b:2')).toEqual([{ itemId: 'a', quantity: 1 }, { itemId: 'b', quantity: 2 }]);
    expect(decodeParts('x:0,:2')).toBeNull();
    expect(decodeParts(null)).toBeNull();
  });
});
