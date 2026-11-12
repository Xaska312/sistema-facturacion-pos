import { FinanceDashboard } from '../../core/api/finance.api';
import { formatCop } from '../../shared/money';

/** Qué tanto se ha cubierto la meta del mes (0 a 100, para la barra). */
export function progressPercent(sales: number, target: number | null): number {
  if (!target || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((sales / target) * 100)));
}

/** El punto de equilibrio en palabras: lo que hay que vender y cómo va. */
export function breakEvenWords(d: FinanceDashboard): string[] {
  const b = d.breakEven;
  if (b.basis === null) {
    return ['Para calcular cuánto necesitas vender, registra tus gastos en Gastos o crea tus gastos fijos (arriendo, '
      + 'nómina, servicios).'];
  }
  if (b.perDay === null || b.perMonth === null) {
    return ['Todavía no hay ventas con costo en los últimos 30 días para saber cuánto te deja cada venta.'];
  }
  const source = b.basis === 'LAST_MONTH' ? 'tus gastos del mes pasado' : 'tus gastos fijos';
  const lines = [
    `Con ${source} (${formatCop(b.monthlyExpenses)}) y un margen de ${b.grossMargin} %, necesitas vender `
      + `${formatCop(b.perDay)} al día (${formatCop(b.perMonth)} al mes, sin IVA) para no perder.`,
  ];
  if (b.averageDailySales >= b.perDay) {
    lines.push(`En los últimos 30 días vendiste en promedio ${formatCop(b.averageDailySales)} al día: vas por encima.`);
  } else {
    lines.push(`En los últimos 30 días vendiste en promedio ${formatCop(b.averageDailySales)} al día: te faltan `
      + `${formatCop(b.perDay - b.averageDailySales)} diarios.`);
  }
  return lines;
}

/** "+12 %" frente al mes anterior, o nada si no hay con qué comparar. */
export function versusText(change: number | null): string {
  if (change === null) {
    return 'Sin gastos el mes anterior para comparar';
  }
  if (change === 0) {
    return 'Igual que el mes anterior';
  }
  const abs = Math.abs(change).toLocaleString('es-CO', { maximumFractionDigits: 1 });
  return change > 0 ? `${abs} % más que el mes anterior` : `${abs} % menos que el mes anterior`;
}
