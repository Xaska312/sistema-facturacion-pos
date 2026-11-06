import { Sale } from '../../core/api/api.models';
import { formatDateTime } from '../../shared/format';
import { formatCop, formatQuantity } from '../../shared/money';
import { methodLabel } from '../pos/pos-labels';

/**
 * Recibo de una venta en texto para WhatsApp (decisión 261): negocio, número y fecha, productos, total, cómo pagó y
 * el pie del tiquete. Sin número de destino: el vendedor elige el contacto en WhatsApp.
 */
export function saleMessage(sale: Sale): string {
  const business = sale.receipt.businessName || 'nuestra tienda';
  // Cobro partido entre cajas (decisión 294): un solo mensaje con todas las partes.
  const parts = sale.together && sale.together.length > 1 ? sale.together : [sale];
  const lines = parts.flatMap((part) => part.items).map((i) => {
    // Adiciones y nota (Fase 12b-1): "Granizado (Grande, Shot extra x2)".
    const extras = (i.modifiers ?? []).map((m) => (m.quantity > 1 ? `${m.optionName} x${m.quantity}` : m.optionName));
    const detail = [...extras, ...(i.note ? [i.note] : [])];
    const name = detail.length > 0 ? `${i.name} (${detail.join(', ')})` : i.name;
    return `• ${name} (${formatQuantity(i.quantity)} ${i.unitCode}): ${formatCop(i.total)}`;
  });
  const paid = new Map<string, { code: string; name: string; amount: number }>();
  for (const p of parts.flatMap((part) => part.payments)) {
    const found = paid.get(p.methodCode);
    paid.set(p.methodCode, { code: p.methodCode, name: p.methodName, amount: (found?.amount ?? 0) + p.amount });
  }
  const payments = [...paid.values()].map((p) => `${methodLabel(p.code, p.name)} ${formatCop(p.amount)}`);
  const sum = (pick: (s: Sale) => number) => Math.round(parts.reduce((t, s) => t + pick(s), 0) * 100) / 100;
  return [
    ...(sale.status === 'VOIDED' ? ['*** VENTA ANULADA ***'] : []),
    `Gracias por tu compra en ${business}.`,
    `${parts.length > 1 ? 'Tiquetes ' + parts.map((p) => p.documentNumber).join(' y ') : 'Tiquete ' + sale.documentNumber} · ${formatDateTime(sale.createdAt)}`,
    ...lines,
    ...(sum((s) => s.discountTotal) > 0 ? [`Descuentos: −${formatCop(sum((s) => s.discountTotal))}`] : []),
    `Total: ${formatCop(sum((s) => s.total))}`,
    ...(payments.length > 0 ? [`Pagó: ${payments.join(' + ')}`] : []),
    ...(sum((s) => s.changeAmount) > 0 ? [`Cambio: ${formatCop(sum((s) => s.changeAmount))}`] : []),
    ...(sale.receipt.footer ? [sale.receipt.footer] : []),
  ].join('\n');
}

export function saleWhatsAppLink(sale: Sale): string {
  return `https://wa.me/?text=${encodeURIComponent(saleMessage(sale))}`;
}
