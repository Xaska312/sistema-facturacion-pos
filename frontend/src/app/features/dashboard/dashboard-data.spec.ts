import { ReportSummary, SalesReportRow } from '../../core/api/api.models';
import { buildKpis, dayChart, hourChart, hourLabel, paymentChart, valuesByDay } from './dashboard-data';

function summary(total: number, salesCount: number, profit = 0): ReportSummary {
  return {
    from: '', to: '', salesCount, grossTotal: total, discountTotal: 0, subtotal: total, taxTotal: 0, total,
    averageTicket: salesCount ? total / salesCount : 0, cost: 0, profit, marginPercent: 0, voidedCount: 0, voidedTotal: 0,
  };
}

function day(key: string, total: number): SalesReportRow {
  return { key, label: key, salesCount: 1, subtotal: total, taxTotal: 0, total, averageTicket: total, cost: 0, profit: total / 2,
    marginPercent: 50 };
}

describe('dashboard-data', () => {
  const range = { from: '2026-10-01', to: '2026-10-03' };

  it('rellena con cero los días sin ventas', () => {
    expect(valuesByDay(range, [day('2026-10-02', 500)], (r) => r.total)).toEqual([0, 500, 0]);
  });

  it('calcula variación frente al periodo anterior y tendencia', () => {
    const kpis = buildKpis(summary(1100, 10, 300), summary(1000, 8, 300), range, [day('2026-10-01', 100)]);
    expect(kpis.map((k) => k.label)).toEqual(['Ventas', 'Número de ventas', 'Ticket promedio', 'Utilidad']);
    expect(kpis[0].change).toBe(10);
    expect(kpis[1].change).toBe(25);
    expect(kpis[3].change).toBe(0);
    expect(kpis[0].trend).toEqual([100, 0, 0]);
  });

  it('sin periodo anterior no hay variación', () => {
    expect(buildKpis(summary(100, 1), summary(0, 0), range, [])[0].change).toBeNull();
  });

  it('ventas por hora: de 7 a. m. a 8 p. m., ampliando si hubo ventas fuera', () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, salesCount: 0, total: hour === 22 ? 50 : 0 }));
    const chart = hourChart(hours);
    expect(chart.labels[0]).toBe('7 a. m.');
    expect(chart.labels.at(-1)).toBe('10 p. m.');
    expect(hourLabel(12)).toBe('12 m.');
    expect(hourLabel(0)).toBe('12 a. m.');
  });

  it('compara día a día con el periodo anterior', () => {
    const chart = dayChart(range, [day('2026-10-01', 10)], { from: '2026-09-28', to: '2026-09-30' },
      [day('2026-09-30', 7)], 'Este periodo', 'Periodo anterior');
    expect(chart.series[0].data).toEqual([10, 0, 0]);
    expect(chart.series[1]).toEqual({ label: 'Periodo anterior', data: [0, 0, 7], role: 'compare' });
    expect(chart.labels.length).toBe(3);
  });

  it('medios de pago sin ceros', () => {
    const chart = paymentChart([
      { paymentMethodId: '1', code: 'CASH', name: 'Efectivo', count: 3, amount: 900 },
      { paymentMethodId: '2', code: 'CARD', name: 'Tarjeta', count: 0, amount: 0 },
    ]);
    expect(chart.labels).toEqual(['Efectivo']);
  });
});
