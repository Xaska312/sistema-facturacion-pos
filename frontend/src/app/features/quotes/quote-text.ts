import { Quote, QuoteFilter, QuoteItem, QuoteStatus } from '../../core/api/api.models';
import { StatusKey } from '../../shared/status';
import { formatCop, formatPercent } from '../../shared/money';
import { lineAmounts } from '../pos/sale-math';
import { whatsAppNumber } from '../credit/credit-text';
import { DraftItem, daysUntil, draftProblem, draftQuantity, formatDay, isoDay, parseDay, sizeText } from '../orders/order-text';

/** Textos, fechas y cálculos de cotizaciones (decisión 260). */

export const QUOTE_FILTERS: { value: QuoteFilter; label: string }[] = [
  { value: 'OPEN', label: 'Vigentes' },
  { value: 'EXPIRED', label: 'Vencidas' },
  { value: 'ACCEPTED', label: 'Aceptadas' },
  { value: 'REJECTED', label: 'Rechazadas' },
  { value: 'ALL', label: 'Todas' },
];

/** Insignia: abierta y con la fecha pasada se pinta como vencida. */
export function quoteBadge(quote: { status: QuoteStatus; expired: boolean; convertedType?: string | null }):
  { key: StatusKey; label: string } {
  switch (quote.status) {
    case 'ACCEPTED':
      return { key: 'completed', label: quote.convertedType === 'SALE' ? 'Vendida' : 'En pedido' };
    case 'REJECTED':
      return { key: 'voided', label: 'Rechazada' };
    default:
      return quote.expired ? { key: 'expired', label: 'Vencida' } : { key: 'pending', label: 'Vigente' };
  }
}

/**
 * "Vence hoy", "Vence mañana", "Vence en 5 días", "Venció hace 2 días". {@code expired} es lo que dice el servidor
 * con la fecha del negocio: manda si el equipo tiene otra fecha.
 */
export function validLabel(validUntil: string, now: Date = new Date(), expired?: boolean): string {
  const days = daysUntil(validUntil, now);
  if (days === null) {
    return '';
  }
  if (expired === true && days >= 0) {
    return 'Vencida';
  }
  if (days === 0 || (expired === false && days < 0)) {
    return 'Vence hoy';
  }
  if (days === 1) {
    return 'Vence mañana';
  }
  if (days > 1) {
    return `Vence en ${days} días`;
  }
  return `Venció hace ${-days} ${days === -1 ? 'día' : 'días'}`;
}

/** "2026-10-20" + 15 días → "2026-11-04" (fecha local, sin correrse por la zona horaria). */
export function addDays(day: string, days: number): string {
  const date = parseDay(day) ?? new Date();
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

/** A quién se le cotiza: el cliente registrado o el prospecto. */
export function partyName(quote: Pick<Quote, 'customerName' | 'prospectName'>): string {
  return quote.customerName ?? quote.prospectName ?? '';
}

export function partyPhone(quote: Pick<Quote, 'customerId' | 'customerPhone' | 'prospectPhone'>): string | null {
  return quote.customerId ? quote.customerPhone : quote.prospectPhone;
}

// ---------------------------------------------------------------- líneas del editor

/** Línea de una cotización: la del pedido más el descuento (%). */
export interface QuoteDraft extends DraftItem {
  discountPercent: number | null;
}

/** Descuento a 2 decimales (0 si está vacío). */
export function discountOf(item: Pick<QuoteDraft, 'discountPercent'>): number {
  const value = Number(item.discountPercent ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
}

/** Total estimado de la línea con su descuento (el servidor lo recalcula con el impuesto vigente). */
export function quoteDraftTotal(item: QuoteDraft, pricesIncludeTax: boolean): number {
  const quantity = draftQuantity(item);
  const price = Number(item.unitPrice ?? 0);
  return quantity === null || !(price > 0) ? 0
    : lineAmounts(price, quantity, discountOf(item), item.taxRate, pricesIncludeTax).total;
}

/** Primer problema de las líneas (medidas, cantidades, precios y descuentos); null si están bien. */
export function quoteDraftProblem(items: readonly QuoteDraft[]): string | null {
  const problem = draftProblem(items);
  if (problem !== null) {
    return problem;
  }
  for (const item of items) {
    const raw = Number(item.discountPercent ?? 0);
    if (!Number.isFinite(raw) || raw < 0 || raw >= 100) {
      return `El descuento de ${item.productName} debe estar entre 0 y 99,99 %.`;
    }
  }
  return null;
}

/** "Mesón cocina · 2,4 × 0,6 m = 1,44 M2 · −10 %". */
export function itemDetail(item: Pick<QuoteItem, 'width' | 'length' | 'quantity' | 'unitCode' | 'discountPercent'>): string {
  const discount = item.discountPercent > 0 ? ` · −${formatPercent(item.discountPercent)}` : '';
  return sizeText(item) + discount;
}

// ---------------------------------------------------------------- WhatsApp

/** Resumen de la cotización para WhatsApp: líneas, total, vigencia y condiciones. */
export function quoteMessage(quote: Quote, businessName: string): string {
  const lines = quote.items.map((i) => {
    const name = i.description ? `${i.productName} · ${i.description}` : i.productName;
    return `• ${name} (${itemDetail(i)}): ${formatCop(i.total)}`;
  });
  const firstName = partyName(quote).trim().split(/\s+/)[0] ?? '';
  return [
    `Hola${firstName ? ' ' + firstName : ''}, te saludamos de ${businessName}. Esta es la cotización ${quote.number}:`,
    ...lines,
    `Total: ${formatCop(quote.total)}`,
    `Válida hasta: ${formatDay(quote.validUntil)}`,
    ...(quote.terms ? [quote.terms] : []),
    'Quedamos atentos.',
  ].join('\n');
}

export function quoteWhatsAppLink(quote: Quote, businessName: string): string {
  const number = whatsAppNumber(partyPhone(quote));
  const text = encodeURIComponent(quoteMessage(quote, businessName));
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}
