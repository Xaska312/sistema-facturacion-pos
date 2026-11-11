import { Statement } from '../../core/api/finance.api';
import { formatCop } from '../../shared/money';

/** Fila del estado de resultados en pantalla y en el PDF. */
export interface StatementRow {
  key: string;
  label: string;
  /** Explicación corta para quien no es contador. */
  hint: string | null;
  kind: 'income' | 'minus' | 'result' | 'expense' | 'info';
  value: (s: Statement) => number | null;
}

/** Las filas en orden: ventas, costo, utilidad bruta, cada gasto, total de gastos y utilidad operativa. */
export function statementRows(current: Statement, others: readonly (Statement | null)[]): StatementRow[] {
  const names = new Map<string, string>();
  for (const s of [current, ...others]) {
    for (const e of s?.expenses ?? []) {
      names.set(e.categoryId ?? 'none', e.name);
    }
  }
  const expenseRows: StatementRow[] = [...names.entries()].map(([id, name]) => ({
    key: 'e-' + id, label: name, hint: null, kind: 'expense',
    value: (s) => s.expenses.find((e) => (e.categoryId ?? 'none') === id)?.amount ?? 0,
  }));
  return [
    { key: 'net', label: 'Ventas', hint: 'Lo que vendiste, sin el IVA', kind: 'income', value: (s) => s.netSales },
    { key: 'cost', label: 'Costo de lo vendido', hint: 'Lo que te costó la mercancía que vendiste', kind: 'minus',
      value: (s) => s.cost },
    { key: 'gross', label: 'Utilidad bruta', hint: 'Lo que te queda de vender, antes de los gastos', kind: 'result',
      value: (s) => s.grossProfit },
    ...expenseRows,
    { key: 'expenses', label: 'Total de gastos', hint: 'Arriendo, servicios, nómina y los demás', kind: 'minus',
      value: (s) => s.expensesTotal },
    { key: 'operating', label: 'Utilidad operativa', hint: 'Lo que ganaste (o perdiste) en el periodo',
      kind: 'result', value: (s) => s.operatingProfit },
  ];
}

/** Variación frente a otro periodo en %, con un decimal (nula si el otro no tiene base para comparar). */
export function change(current: number | null, other: number | null): number | null {
  if (current === null || other === null || other === 0) {
    return null;
  }
  return Math.round(((current - other) / Math.abs(other)) * 1000) / 10;
}

/** "+12,5 %", "−3 %". */
export function changeText(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}

/** "40 %" de margen. */
export function marginText(value: number | null): string {
  return value === null ? '' : `${value.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}

/** El resultado en palabras simples, para el dueño de una tienda. */
export function plainWords(s: Statement): string[] {
  if (!s.hasData) {
    return ['En este periodo no hay ventas ni gastos registrados.'];
  }
  const lines = [
    `Vendiste ${formatCop(s.netSales)} sin contar el IVA.`,
    `Eso que vendiste te costó ${formatCop(s.cost)}, así que te quedaron ${formatCop(s.grossProfit)}`
      + (s.grossMargin === null ? '.' : ` (${marginText(s.grossMargin)} de lo vendido).`),
  ];
  if (s.expensesTotal > 0) {
    const top = [...s.expenses].sort((a, b) => b.amount - a.amount)[0];
    lines.push(`Pagaste ${formatCop(s.expensesTotal)} en gastos; el más grande fue ${top.name.toLowerCase()} `
      + `(${formatCop(top.amount)}).`);
  } else {
    lines.push('No registraste gastos en este periodo: si los tuviste, regístralos en Gastos para que el resultado sea real.');
  }
  if (s.operatingProfit > 0) {
    lines.push(`Ganaste ${formatCop(s.operatingProfit)}.`);
  } else if (s.operatingProfit < 0) {
    lines.push(`Perdiste ${formatCop(-s.operatingProfit)}: los gastos fueron más de lo que te dejaron las ventas.`);
  } else {
    lines.push('Quedaste en cero: ni ganaste ni perdiste.');
  }
  return lines;
}
