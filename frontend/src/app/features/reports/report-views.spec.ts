import { SalesReportRow } from '../../core/api/api.models';
import { csvFor, salesTotals, slowDaysFrom } from './report-views';

function row(total: number, subtotal: number, profit: number, salesCount: number): SalesReportRow {
  return { key: String(total), label: '', salesCount, subtotal, taxTotal: total - subtotal, total, averageTicket: 0,
    cost: subtotal - profit, profit, marginPercent: 0 };
}

describe('report-views', () => {
  it('exporta el CSV de la pestaña actual', () => {
    expect(csvFor('summary', 'total').report).toBe('sales');
    expect(csvFor('products', 'quantity')).toEqual({ report: 'products', extra: { orderBy: 'quantity' } });
    expect(csvFor('inventory', 'total').report).toBe('inventory/valuation');
    expect(csvFor('slow', 'total', 60)).toEqual({ report: 'inventory/slow-movers', extra: { days: 60 } });
  });

  it('"Sin rotación" acepta 30, 60, 90 o 180 días desde la URL', () => {
    expect(slowDaysFrom('60')).toBe(60);
    expect(slowDaysFrom(null)).toBe(90);
    expect(slowDaysFrom('7')).toBe(90);
    expect(slowDaysFrom('abc')).toBe(90);
  });

  it('suma los totales con el margen sobre la base', () => {
    expect(salesTotals([row(1190, 1000, 300, 2), row(595, 500, 100, 1)]))
      .toEqual({ total: 1785, salesCount: 3, profit: 400, marginPercent: 26.67 });
    expect(salesTotals([]).marginPercent).toBe(0);
  });
});
