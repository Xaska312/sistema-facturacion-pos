import { Statement } from '../../core/api/finance.api';
import { change, changeText, marginText, plainWords, statementRows } from './income-statement-text';

const base: Statement = {
  from: '2026-11-01', to: '2026-11-30', salesCount: 3, salesTotal: 357000, tax: 57000, netSales: 300000, cost: 180000,
  grossProfit: 120000, grossMargin: 40, expenses: [{ categoryId: 'a', name: 'Arriendo', amount: 100000 }],
  expensesTotal: 100000, operatingProfit: 20000, operatingMargin: 6.7, withheld: 0, hasData: true,
};

describe('income-statement-text (decisión 323)', () => {
  it('arma las filas con un renglón por categoría de gasto de cualquiera de los periodos', () => {
    const previous = { ...base, expenses: [{ categoryId: 'b', name: 'Nómina', amount: 50000 }] };
    const rows = statementRows(base, [previous, null]);
    expect(rows.map((r) => r.label)).toEqual(['Ventas', 'Costo de lo vendido', 'Utilidad bruta', 'Arriendo', 'Nómina',
      'Total de gastos', 'Utilidad operativa']);
    expect(rows[4].value(base)).toBe(0);
    expect(rows[4].value(previous)).toBe(50000);
  });

  it('calcula y escribe la variación', () => {
    expect(change(120, 100)).toBe(20);
    expect(change(-50, 100)).toBe(-150);
    expect(change(10, 0)).toBeNull();
    expect(changeText(12.5)).toBe('+12,5 %');
    expect(changeText(-3)).toBe('−3 %');
    expect(changeText(null)).toBe('—');
    expect(marginText(40)).toBe('40 %');
  });

  it('lo explica en palabras simples', () => {
    expect(plainWords(base)).toEqual([
      'Vendiste $ 300.000 sin contar el IVA.',
      'Eso que vendiste te costó $ 180.000, así que te quedaron $ 120.000 (40 % de lo vendido).',
      'Pagaste $ 100.000 en gastos; el más grande fue arriendo ($ 100.000).',
      'Ganaste $ 20.000.',
    ]);
    expect(plainWords({ ...base, operatingProfit: -5000 })[3]).toContain('Perdiste $ 5.000');
    expect(plainWords({ ...base, hasData: false })).toEqual(['En este periodo no hay ventas ni gastos registrados.']);
  });
});
