import { SalesReportRow } from '../../core/api/api.models';
import { CsvReport } from '../../core/api/reports.api';

export type ReportTab =
  | 'summary'
  | 'days'
  | 'branches'
  | 'sellers'
  | 'payments'
  | 'products'
  | 'categories'
  | 'taxes'
  | 'inventory';

/** CSV que corresponde a cada pestaña (en el resumen: las ventas una por una). */
export function csvFor(tab: ReportTab, productOrder: 'total' | 'quantity'):
  { report: CsvReport; extra: Record<string, string | number | null> } {
  switch (tab) {
    case 'summary':
      return { report: 'sales', extra: {} };
    case 'days':
      return { report: 'sales/by-day', extra: {} };
    case 'branches':
      return { report: 'sales/by-branch', extra: {} };
    case 'sellers':
      return { report: 'sales/by-seller', extra: {} };
    case 'payments':
      return { report: 'sales/by-payment-method', extra: {} };
    case 'products':
      return { report: 'products', extra: { orderBy: productOrder, limit: 1000 } };
    case 'categories':
      return { report: 'categories', extra: {} };
    case 'taxes':
      return { report: 'taxes', extra: {} };
    case 'inventory':
      return { report: 'inventory/valuation', extra: {} };
  }
}

/** Totales de filas agrupadas (por día, sucursal o vendedor); el margen es utilidad / base. */
export function salesTotals(rows: readonly SalesReportRow[]): {
  total: number;
  salesCount: number;
  profit: number;
  marginPercent: number;
} {
  const sum = (pick: (row: SalesReportRow) => number): number => rows.reduce((acc, row) => acc + pick(row), 0);
  const subtotal = sum((r) => r.subtotal);
  const profit = sum((r) => r.profit);
  return {
    total: sum((r) => r.total),
    salesCount: sum((r) => r.salesCount),
    profit,
    marginPercent: subtotal > 0 ? Math.round((profit / subtotal) * 10000) / 100 : 0,
  };
}
