import { CartLine, cartTotals, cashSuggestions, lineAmounts, money, parseScan, summarizePayments } from './sale-math';

const line = (over: Partial<CartLine> = {}): CartLine => ({
  key: 'p|u', productId: 'p', sku: 'P', name: 'Producto', unitId: 'u', unitCode: 'UND', quantity: 1,
  unitPrice: 2000, discountPercent: 0, taxRate: 19, trackInventory: true, ...over,
});

describe('sale-math', () => {
  it('redondea HALF_UP a 2 decimales', () => {
    expect(money(1.005)).toBe(1.01);
    expect(money(3361.344537)).toBe(3361.34);
    expect(money(-2.345)).toBe(-2.35);
  });

  it('separa base e IVA cuando el precio lo incluye (igual que el backend)', () => {
    expect(lineAmounts(2000, 2, 0, 19, true)).toEqual({ gross: 4000, discount: 0, base: 3361.34, tax: 638.66, total: 4000 });
    expect(lineAmounts(10000, 1, 10, 19, true)).toEqual({ gross: 10000, discount: 1000, base: 7563.03, tax: 1436.97, total: 9000 });
  });

  it('suma el impuesto cuando el precio no lo incluye', () => {
    expect(lineAmounts(1000, 3, 0, 19, false)).toEqual({ gross: 3000, discount: 0, base: 3000, tax: 570, total: 3570 });
    expect(lineAmounts(1000, 2, 5, 5, false)).toEqual({ gross: 2000, discount: 100, base: 1900, tax: 95, total: 1995 });
  });

  it('totaliza el carrito', () => {
    const totals = cartTotals([line({ quantity: 2 }), line({ key: 'x', unitPrice: 18000, taxRate: 0 })], true);
    expect(totals.total).toBe(22000);
    expect(totals.tax).toBe(638.66);
    expect(totals.items).toBe(3);
  });

  it('calcula cambio y faltante; el cambio solo sale del efectivo', () => {
    const cash = { methodId: 'c', affectsCash: true, reference: '' };
    const card = { methodId: 't', affectsCash: false, reference: '' };
    expect(summarizePayments(4000, [{ ...cash, amount: 10000 }])).toEqual(
      { paid: 10000, missing: 0, change: 6000, nonCashExceeds: false, valid: true });
    expect(summarizePayments(25000, [{ ...card, amount: 20000 }, { ...cash, amount: 2000 }]).missing).toBe(3000);
    expect(summarizePayments(1000, [{ ...card, amount: 1500 }]).nonCashExceeds).toBeTrue();
    expect(summarizePayments(1000, [{ ...card, amount: 1500 }]).valid).toBeFalse();
    expect(summarizePayments(1000, [{ ...cash, amount: null }]).valid).toBeFalse();
    expect(summarizePayments(0, []).valid).toBeTrue();
  });

  it('interpreta cantidad*código del lector', () => {
    expect(parseScan('7701234')).toEqual({ quantity: 1, code: '7701234' });
    expect(parseScan('3*7701234')).toEqual({ quantity: 3, code: '7701234' });
    expect(parseScan('0,5 * QUESO')).toEqual({ quantity: 0.5, code: 'QUESO' });
    expect(parseScan('   ')).toBeNull();
  });

  it('sugiere billetes para pagar en efectivo', () => {
    expect(cashSuggestions(4000)).toEqual([4000, 5000, 10000, 20000, 50000]);
    expect(cashSuggestions(0)).toEqual([]);
  });
});
