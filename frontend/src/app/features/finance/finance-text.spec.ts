import { FinanceDashboard } from '../../core/api/finance.api';
import { breakEvenWords, progressPercent, versusText } from './finance-text';

function dashboard(breakEven: Partial<FinanceDashboard['breakEven']>): FinanceDashboard {
  return {
    from: '2026-11-01', to: '2026-11-11', netSales: 0, grossProfit: 0, operatingProfit: 0,
    flow: { in: 0, out: 0, net: 0, byMethod: [] },
    balances: { creditOwed: 0, creditCustomers: 0, ordersOwed: 0, openOrders: 0, suppliersOwed: 0, suppliersOverdue: 0,
      suppliersDueSoon: 0 },
    expenses: { thisMonth: 0, lastMonth: 0, changePercent: null, top: [], unpaidRecurring: 0, unpaidRecurringTotal: 0 },
    breakEven: { basis: 'RECURRING', monthlyExpenses: 600000, grossMargin: 40, perMonth: 1500000, perDay: 50000,
      averageDailySales: 40000, monthSales: 0, monthTarget: 550000, ...breakEven },
  };
}

describe('finance-text (decisión 324)', () => {
  it('limita la barra de la meta entre 0 y 100', () => {
    expect(progressPercent(275000, 550000)).toBe(50);
    expect(progressPercent(900000, 550000)).toBe(100);
    expect(progressPercent(10, null)).toBe(0);
  });

  it('explica el punto de equilibrio', () => {
    expect(breakEvenWords(dashboard({}))).toEqual([
      'Con tus gastos fijos ($ 600.000) y un margen de 40 %, necesitas vender $ 50.000 al día ($ 1.500.000 al mes, '
        + 'sin IVA) para no perder.',
      'En los últimos 30 días vendiste en promedio $ 40.000 al día: te faltan $ 10.000 diarios.',
    ]);
    expect(breakEvenWords(dashboard({ averageDailySales: 60000 }))[1]).toContain('vas por encima');
    expect(breakEvenWords(dashboard({ basis: null }))[0]).toContain('registra tus gastos');
    expect(breakEvenWords(dashboard({ perDay: null, perMonth: null }))[0]).toContain('Todavía no hay ventas');
  });

  it('compara los gastos con el mes anterior', () => {
    expect(versusText(12.5)).toBe('12,5 % más que el mes anterior');
    expect(versusText(-3)).toBe('3 % menos que el mes anterior');
    expect(versusText(null)).toContain('Sin gastos');
  });
});
