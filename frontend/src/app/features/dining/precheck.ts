import { Precheck } from '../../core/api/dining.api';
import { EscPos, columns, row, wrap } from '../../core/printing/escpos';
import { formatCop, formatQuantity } from '../../shared/money';

/**
 * Precuenta impresa (decisión 380): lo que falta por cobrar de la cuenta, para que el cliente lo revise antes de pagar.
 * No es un tiquete de venta: lo dice abajo. La propina es voluntaria y se calcula sobre la base sin impuestos
 * (ley 1935 de 2018), como al cobrar.
 */
export interface PrecheckBusiness {
  name: string;
  /** Encabezado del negocio (decisión 331), un dato por renglón. */
  header: string | null;
}

export const PRECHECK_NOTICE = 'Esta precuenta no es un tiquete de venta. Al pagar te entregamos tu tiquete.';

/** "Mesa 4 · Salón" o el nombre de la cuenta. */
export function precheckTitle(p: Precheck): string {
  if (p.tableName) {
    return p.zoneName ? `Mesa ${p.tableName} · ${p.zoneName}` : `Mesa ${p.tableName}`;
  }
  return p.label;
}

export function precheckDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Renglones del encabezado del negocio, sin vacíos. */
export function headerLines(header: string | null): string[] {
  return (header ?? '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
}

/** La misma precuenta, en ESC/POS para XASKA Impresora. */
export function precheckBytes(p: Precheck, business: PrecheckBusiness, width: 58 | 80, plain: boolean): Uint8Array {
  const w = columns(width);
  const cop = formatCop;
  const out = new EscPos(plain);
  out.align('center').bold(true).big(true).lines(wrap(business.name, w)).big(false).bold(false);
  for (const line of headerLines(business.header)) {
    out.lines(wrap(line, w));
  }
  out.line().bold(true).big(true).line('PRECUENTA').big(false).bold(false);
  out.align('left');
  out.lines(wrap(precheckTitle(p), w));
  out.line(precheckDate(p.printedAt));
  if (p.openedByName) {
    out.lines(wrap('Atendió: ' + p.openedByName, w));
  }
  out.rule(w);
  for (const l of p.lines) {
    out.lines(wrap(l.name, w));
    if (l.details) {
      out.lines(wrap('  * ' + l.details, w));
    }
    out.lines(row(`  ${formatQuantity(l.quantity)} x ${cop(l.unitPrice)}`, cop(l.total), w));
  }
  out.rule(w);
  if (p.chargedTotal > 0) {
    out.lines(row('Ya pagado', cop(p.chargedTotal), w));
  }
  out.lines(row('Subtotal (base)', cop(p.subtotal), w));
  if (p.tax > 0) {
    out.lines(row('Impuestos', cop(p.tax), w));
  }
  out.bold(true).big(true).lines(row('TOTAL', cop(p.total), w)).big(false).bold(false);
  if (p.suggestedTip > 0) {
    out.lines(row(`Propina voluntaria sugerida (${p.tipPercent} %)`, cop(p.suggestedTip), w));
    out.bold(true).lines(row('Total con propina', cop(p.total + p.suggestedTip), w)).bold(false);
  }
  out.rule(w).align('center').lines(wrap(PRECHECK_NOTICE, w));
  return out.cut().build();
}
