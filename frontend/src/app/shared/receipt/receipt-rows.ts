import { Sale } from '../../core/api/api.models';
import { formatCop, formatQuantity } from '../money';
import { documentShortLabel } from '../document-types';
import { splitSummary } from './split-receipt';
import { businessLines } from './doc-header';

/**
 * El tiquete de venta como lista de renglones (decisión 326), para dibujarlo como imagen igual al impreso. Sigue el
 * mismo orden que {@link ReceiptComponent}: si se cambia uno, hay que cambiar el otro.
 */
export type ReceiptRow =
  | { kind: 'text'; text: string; center?: boolean; bold?: boolean; big?: boolean; small?: boolean; indent?: boolean; gap?: boolean }
  | { kind: 'pair'; left: string; right: string; bold?: boolean; big?: boolean; gap?: boolean }
  | { kind: 'hr' };

const cop = formatCop;
const q = formatQuantity;

/** Fecha y hora de la venta en la zona del negocio ("11/11/26, 4:01 p. m."). */
export function receiptDate(sale: Sale): string {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: sale.receipt.timezone ?? undefined,
    }).format(new Date(sale.createdAt));
  } catch {
    return new Date(sale.createdAt).toLocaleString('es-CO');
  }
}

/** Documento del cliente con su dígito de verificación. */
export function receiptDocument(sale: Sale): string {
  return sale.customerVerificationDigit === null
    ? sale.customerDocumentNumber
    : `${sale.customerDocumentNumber}-${sale.customerVerificationDigit}`;
}

export function receiptRows(sale: Sale): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const text = (t: string, o: Omit<Extract<ReceiptRow, { kind: 'text' }>, 'kind' | 'text'> = {}) =>
    rows.push({ kind: 'text', text: t, ...o });
  const pair = (left: string, right: string, o: Omit<Extract<ReceiptRow, { kind: 'pair' }>, 'kind' | 'left' | 'right'> = {}) =>
    rows.push({ kind: 'pair', left, right, ...o });
  const hr = () => rows.push({ kind: 'hr' });
  const r = sale.receipt;

  text(r.businessName ?? '', { center: true, bold: true });
  for (const line of businessLines(r)) text(line, { center: true });

  const lines = (part: Sale) => {
    for (const item of part.items) {
      text(item.name);
      for (const m of item.modifiers ?? []) {
        text(`+ ${m.optionName}${m.quantity > 1 ? ' x' + m.quantity : ''}`, { indent: true });
      }
      if (item.note) text(`* ${item.note}`, { indent: true });
      pair(`${q(item.quantity)} ${item.unitCode} × ${cop(item.unitPrice)}`, cop(item.grossAmount));
      if (item.discountAmount > 0) pair(`  Desc. ${q(item.discountPercent)} %`, `-${cop(item.discountAmount)}`);
    }
  };
  const taxes = (part: Sale) => {
    for (const t of part.taxes) {
      if (t.taxAmount > 0) pair(`${t.taxType} ${q(t.taxRate)} %`, cop(t.taxAmount));
    }
  };
  const head = (title: string) => {
    text(title, { center: true, bold: true, gap: true });
    text(receiptDate(sale));
    text(`Caja ${r.registerCode} · ${sale.createdByName}`);
    text(`Cliente: ${sale.customerName}`);
    text(`${documentShortLabel(sale.customerDocumentType)} ${receiptDocument(sale)}`);
  };

  const split = splitSummary(sale);
  if (split) {
    head(sale.notes ?? 'Cuenta');
    for (const part of split.parts) {
      hr();
      text(`${part.splitLabel} · Tiquete ${part.documentNumber}`, { center: true, bold: true });
      if (part.status === 'VOIDED') text('*** ANULADA ***', { center: true, bold: true });
      lines(part);
      taxes(part);
      pair(`Total ${part.splitLabel}`, cop(part.total), { bold: true });
    }
    hr();
    pair('TOTAL', cop(split.total), { bold: true, big: true });
    if (split.tip) {
      const tip = split.tip;
      pair(`Propina voluntaria (${tip.methodName})${tip.voided ? ' ANULADA' : ''}`, cop(tip.amount), { gap: true });
      pair('Total con propina', cop(split.total + (tip.voided ? 0 : tip.amount)), { bold: true });
    }
    hr();
    for (const p of split.payments) pair(p.methodName, cop(p.tendered));
    if (split.change > 0) pair('Cambio', cop(split.change), { bold: true });
  } else {
    head(`Tiquete ${sale.documentNumber}`);
    if (sale.status === 'VOIDED') {
      text('*** VENTA ANULADA ***', { center: true, bold: true, gap: true });
      if (sale.voidReason) text(sale.voidReason, { center: true });
    }
    hr();
    lines(sale);
    hr();
    if (sale.discountTotal > 0) pair('Descuentos', `-${cop(sale.discountTotal)}`);
    pair('Subtotal (base)', cop(sale.subtotal));
    taxes(sale);
    pair('TOTAL', cop(sale.total), { bold: true, big: true });
    if (sale.tip) {
      const tip = sale.tip;
      pair(`Propina voluntaria (${tip.methodName})${tip.voided ? ' ANULADA' : ''}`, cop(tip.amount), { gap: true });
      pair('Total con propina', cop(sale.total + (tip.voided ? 0 : tip.amount)), { bold: true });
    }
    hr();
    for (const p of sale.payments) pair(p.methodName, cop(p.tendered));
    if (sale.changeAmount > 0) pair('Cambio', cop(sale.changeAmount), { bold: true });
  }
  hr();
  if (r.footer) text(r.footer, { center: true });
  text('Comprobante interno de venta', { center: true, small: true });
  return rows;
}
