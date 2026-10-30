import { CashReport } from '../../core/api/api.models';
import { formatCop } from '../../shared/money';
import { differenceLabel } from './labels';

/** Ticket y resumen por WhatsApp del informe de caja (cierre Z o parcial X). */

const DATE_TIME = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' });

/** "20/10/26, 9:05 p. m."; vacío si no hay fecha. */
export function ticketDateTime(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  try {
    const format = timeZone
      ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone })
      : DATE_TIME;
    return format.format(date).replace(/[\u00a0\u202f]/g, ' ');
  } catch {
    return DATE_TIME.format(date).replace(/[\u00a0\u202f]/g, ' ');
  }
}

export function reportTitle(report: CashReport): string {
  return report.session.status === 'OPEN' ? 'Informe parcial (X)' : 'Cierre de caja (Z)';
}

/** Filas de efectivo que se muestran: las de fiado y pedidos solo si el negocio las usa. */
export function cashRows(report: CashReport): [string, number][] {
  const c = report.cash;
  const rows: [string, number][] = [
    ['Base de apertura', c.opening],
    ['Ventas en efectivo', c.sales],
    ['Devoluciones', c.voidRefunds],
    ['Ingresos', c.incomes],
    ['Egresos', c.expenses],
    ['Retiros', c.withdrawals],
  ];
  if (c.creditPayments) {
    rows.push(['Abonos de fiado', c.creditPayments]);
  }
  if (c.orderPayments) {
    rows.push(['Anticipos de pedidos', c.orderPayments]);
  }
  if (c.tips) {
    rows.push(['Propinas en efectivo', c.tips]);
  }
  if (c.tipPayouts) {
    rows.push(['Propinas repartidas', c.tipPayouts]);
  }
  return rows;
}

/**
 * Resumen en texto para WhatsApp. Respeta el cierre ciego: sin {@code auditView} no lleva el esperado ni la
 * diferencia (igual que el informe en pantalla).
 */
export function cashSummaryText(report: CashReport, businessName: string, timeZone?: string | null): string {
  const s = report.session;
  const lines = [
    `*${reportTitle(report)}* · ${businessName}`.trim(),
    `Caja ${s.registerCode ?? s.registerName ?? '—'}${s.branchName ? ' · ' + s.branchName : ''}`,
    `Abrió ${s.openedByName ?? '—'}: ${ticketDateTime(s.openedAt, timeZone)}`,
  ];
  if (s.closedAt) {
    lines.push(`Cerró ${s.closedByName ?? '—'}: ${ticketDateTime(s.closedAt, timeZone)}`);
  }
  lines.push('', '*Ventas*', `Ventas (${report.salesCount}): ${formatCop(report.salesTotal)}`);
  if (report.voidedCount > 0) {
    lines.push(`Anuladas (${report.voidedCount}): -${formatCop(report.voidedTotal)}`);
  }
  lines.push(`Ventas netas: ${formatCop(report.netSales)}`);
  for (const m of report.byMethod) {
    lines.push(`• ${m.name ?? 'Otro'} (${m.count}): ${formatCop(m.amount)}`);
  }
  lines.push('', '*Efectivo*');
  for (const [label, amount] of cashRows(report)) {
    lines.push(`${label}: ${formatCop(amount)}`);
  }
  const c = report.cash;
  if (report.auditView && c.expected !== null) {
    lines.push(`Esperado: ${formatCop(c.expected)}`);
  }
  if (c.counted !== null) {
    lines.push(`Contado: ${formatCop(c.counted)}`);
  }
  if (report.auditView && c.difference !== null) {
    lines.push(`${differenceLabel(c.difference)}: ${formatCop(c.difference)}`);
  }
  if (s.closingNotes) {
    lines.push('', `Notas: ${s.closingNotes}`);
  }
  return lines.join('\n');
}

/** Enlace de WhatsApp sin número: WhatsApp pide elegir a quién enviarlo. */
export function cashSummaryWhatsApp(report: CashReport, businessName: string, timeZone?: string | null): string {
  return `https://wa.me/?text=${encodeURIComponent(cashSummaryText(report, businessName, timeZone))}`;
}
