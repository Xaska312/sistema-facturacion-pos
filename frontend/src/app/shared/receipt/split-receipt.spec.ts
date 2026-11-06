import { Sale } from '../../core/api/api.models';
import { grandChange, grandTotal, splitSummary } from './split-receipt';

function part(id: string, label: string, total: number, payments: [string, number, number][], extra: Partial<Sale> = {}): Sale {
  return {
    id, splitLabel: label, total, changeAmount: 0, tip: null, documentNumber: 'POS-' + id,
    payments: payments.map(([methodName, amount, tendered], i) => ({ lineNo: i + 1, methodName, amount, tendered })),
    ...extra,
  } as unknown as Sale;
}

describe('tiquete del cobro partido entre cajas (decisión 294)', () => {
  const piso1 = part('1', 'Piso 1', 18000, [['Tarjeta', 6750, 10750], ['Efectivo', 11250, 16250]],
    { changeAmount: 5000, tip: { amount: 4000, methodName: 'Tarjeta', voided: false } });
  const piso2 = part('2', 'Piso 2', 22000, [['Tarjeta', 8250, 8250], ['Efectivo', 13750, 13750]]);

  it('suma las partes: total, propina, lo entregado por medio y el cambio', () => {
    const sale = { ...piso1, together: [piso1, piso2] } as Sale;
    const sp = splitSummary(sale)!;
    expect(sp.parts.map((p) => p.splitLabel)).toEqual(['Piso 1', 'Piso 2']);
    expect(sp.total).toBe(40000);
    expect(sp.tip?.amount).toBe(4000);
    expect(sp.change).toBe(5000);
    expect(sp.payments).toEqual([{ methodName: 'Tarjeta', tendered: 19000 }, { methodName: 'Efectivo', tendered: 30000 }]);
    expect(grandTotal(sale)).toBe(40000);
    expect(grandChange(sale)).toBe(5000);
  });

  it('una venta normal no cambia', () => {
    expect(splitSummary(piso2)).toBeNull();
    expect(grandTotal(piso2)).toBe(22000);
    expect(grandChange(piso1)).toBe(5000);
  });
});
