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
  const lines = sale.items.map((i) => `• ${i.name} (${formatQuantity(i.quantity)} ${i.unitCode}): ${formatCop(i.total)}`);
  const payments = sale.payments.map((p) => `${methodLabel(p.methodCode, p.methodName)} ${formatCop(p.amount)}`);
  return [
    ...(sale.status === 'VOIDED' ? ['*** VENTA ANULADA ***'] : []),
    `Gracias por tu compra en ${business}.`,
    `Tiquete ${sale.documentNumber} · ${formatDateTime(sale.createdAt)}`,
    ...lines,
    ...(sale.discountTotal > 0 ? [`Descuentos: −${formatCop(sale.discountTotal)}`] : []),
    `Total: ${formatCop(sale.total)}`,
    ...(payments.length > 0 ? [`Pagó: ${payments.join(' + ')}`] : []),
    ...(sale.changeAmount > 0 ? [`Cambio: ${formatCop(sale.changeAmount)}`] : []),
    ...(sale.receipt.footer ? [sale.receipt.footer] : []),
  ].join('\n');
}

export function saleWhatsAppLink(sale: Sale): string {
  return `https://wa.me/?text=${encodeURIComponent(saleMessage(sale))}`;
}
