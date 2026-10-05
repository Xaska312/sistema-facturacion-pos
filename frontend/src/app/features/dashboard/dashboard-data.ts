import { Dashboard, PaymentReportRow, ProductReportRow, ReportSummary, SalesReportRow } from '../../core/api/api.models';
import { ChartSeries, foldOthers } from '../../shared/charts/chart-config';
import { formatCop, formatPercent } from '../../shared/money';
import { percentChange } from '../../shared/sparkline';
import { DateRange, daysBetween, shortDate } from '../reports/periods';

export interface KpiCard {
  label: string;
  value: string;
  icon: string;
  change: number | null;
  hint: string | null;
  trend: number[];
}

export interface ChartData {
  labels: string[];
  series: ChartSeries[];
}

/** Valores por día del rango (los días sin ventas en cero), en el orden del calendario. */
export function valuesByDay(range: DateRange, rows: readonly SalesReportRow[],
  pick: (row: SalesReportRow) => number): number[] {
  const byDay = new Map(rows.map((r) => [r.key, pick(r)] as const));
  return daysBetween(range.from, range.to).map((day) => byDay.get(day) ?? 0);
}

/** Indicadores principales con variación frente al periodo anterior y tendencia diaria. */
export function buildKpis(current: ReportSummary, previous: ReportSummary | null, trendRange: DateRange,
  trendRows: readonly SalesReportRow[]): KpiCard[] {
  const trend = (pick: (row: SalesReportRow) => number): number[] => valuesByDay(trendRange, trendRows, pick);
  return [
    {
      label: 'Ventas',
      value: formatCop(current.total),
      icon: 'pi pi-dollar',
      change: percentChange(current.total, previous?.total),
      hint: null,
      trend: trend((r) => r.total),
    },
    {
      label: 'Número de ventas',
      value: current.salesCount.toLocaleString('es-CO'),
      icon: 'pi pi-shopping-bag',
      change: percentChange(current.salesCount, previous?.salesCount),
      hint: current.voidedCount > 0 ? `${current.voidedCount} anulada(s)` : null,
      trend: trend((r) => r.salesCount),
    },
    {
      label: 'Ticket promedio',
      value: formatCop(current.averageTicket),
      icon: 'pi pi-receipt',
      change: percentChange(current.averageTicket, previous?.averageTicket),
      hint: null,
      trend: trend((r) => r.averageTicket),
    },
    {
      label: 'Utilidad',
      value: formatCop(current.profit),
      icon: 'pi pi-chart-line',
      change: percentChange(current.profit, previous?.profit),
      hint: `Margen ${formatPercent(current.marginPercent)}`,
      trend: trend((r) => r.profit),
    },
  ];
}

/**
 * Ventas por hora del día. Muestra al menos de 7 a. m. a 8 p. m. y se amplía si hubo ventas antes o después.
 */
export function hourChart(byHour: Dashboard['byHour']): ChartData {
  const withSales = byHour.filter((h) => h.total > 0).map((h) => h.hour);
  const start = Math.min(7, ...withSales);
  const end = Math.max(20, ...withSales);
  const hours = byHour.filter((h) => h.hour >= start && h.hour <= end);
  return {
    labels: hours.map((h) => hourLabel(h.hour)),
    series: [{ label: 'Ventas', data: hours.map((h) => h.total) }],
  };
}

/** "7 a. m.", "12 m.", "3 p. m.". */
export function hourLabel(hour: number): string {
  if (hour === 0) {
    return '12 a. m.';
  }
  if (hour === 12) {
    return '12 m.';
  }
  return hour < 12 ? `${hour} a. m.` : `${hour - 12} p. m.`;
}

/** Ventas por día del periodo y, punteado, el periodo anterior alineado día a día. */
export function dayChart(range: DateRange, rows: readonly SalesReportRow[], previous: DateRange | null,
  previousRows: readonly SalesReportRow[], currentLabel: string, previousLabel: string): ChartData {
  const series: ChartSeries[] = [{ label: currentLabel, data: valuesByDay(range, rows, (r) => r.total) }];
  if (previous) {
    series.push({ label: previousLabel, data: valuesByDay(previous, previousRows, (r) => r.total), role: 'compare' });
  }
  return { labels: daysBetween(range.from, range.to).map(shortDate), series };
}

/** Productos más vendidos (barras horizontales); nombres largos recortados. */
export function topProductsChart(rows: readonly ProductReportRow[]): ChartData {
  return {
    labels: rows.map((p) => (p.name.length > 28 ? `${p.name.slice(0, 27)}…` : p.name)),
    series: [{ label: 'Vendido', data: rows.map((p) => p.total) }],
  };
}

/** Medios de pago para la dona (más de 6 se agrupan en "Otros"). */
export function paymentChart(rows: readonly PaymentReportRow[]): ChartData {
  const slices = foldOthers(rows.filter((r) => r.amount > 0).map((r) => ({ label: r.name, value: r.amount })));
  return { labels: slices.map((s) => s.label), series: [{ label: 'Medios de pago', data: slices.map((s) => s.value) }] };
}
