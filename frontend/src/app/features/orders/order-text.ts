import { Order, OrderPaymentType, OrderStatus } from '../../core/api/api.models';
import { StatusKey } from '../../shared/status';
import { formatCop, formatQuantity } from '../../shared/money';
import { lineAmounts, pesos, quantity4 } from '../pos/sale-math';
import { whatsAppNumber } from '../credit/credit-text';

/** Textos, fechas y cálculos de pedidos por encargo (decisión 258). */

export const PAYMENT_LABEL: Record<OrderPaymentType, string> = {
  DEPOSIT: 'Anticipo',
  REFUND: 'Devolución',
  APPLIED: 'Aplicado a la entrega',
  APPLIED_VOID: 'Entrega anulada',
};

/** Insignia del pedido: abierto y vencido se pinta como atrasado. */
export function orderBadge(order: { status: OrderStatus; overdue: boolean }): { key: StatusKey; label: string } {
  switch (order.status) {
    case 'DELIVERED':
      return { key: 'completed', label: 'Entregado' };
    case 'CANCELLED':
      return { key: 'voided', label: 'Cancelado' };
    default:
      return order.overdue ? { key: 'expired', label: 'Atrasado' } : { key: 'pending', label: 'Por entregar' };
  }
}

/** "2026-10-20" → fecha local (sin correrse un día por la zona horaria, como pasa con new Date('2026-10-20')). */
export function parseDay(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Fecha local → "2026-10-20". */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DAY = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** "mar, 20 oct 2026". */
export function formatDay(value: string | null | undefined): string {
  const date = parseDay(value);
  return date ? DAY.format(date).replace(/[\u00a0\u202f]/g, ' ').replace(/\./g, '') : '—';
}

/** Días de calendario hasta la entrega: 0 = hoy, negativo = atrasado; null si la fecha no es válida. */
export function daysUntil(dueDate: string, now: Date = new Date()): number | null {
  const due = parseDay(dueDate);
  if (!due) {
    return null;
  }
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(due) - day(now)) / 86_400_000);
}

/**
 * "Para hoy", "Para mañana", "En 5 días", "Atrasado 1 día", "Atrasado 3 días". {@code overdue} es lo que dice el
 * servidor con la fecha del negocio: manda si el equipo tiene otra fecha (cerca de medianoche u otra zona horaria).
 */
export function dueLabel(dueDate: string, now: Date = new Date(), overdue?: boolean): string {
  const days = daysUntil(dueDate, now);
  if (days === null) {
    return '';
  }
  if (overdue === true && days >= 0) {
    return 'Atrasado';
  }
  if (overdue === false && days < 0) {
    return 'Para hoy';
  }
  if (days === 0) {
    return 'Para hoy';
  }
  if (days === 1) {
    return 'Para mañana';
  }
  if (days > 1) {
    return `En ${days} días`;
  }
  return `Atrasado ${-days} ${days === -1 ? 'día' : 'días'}`;
}

// ---------------------------------------------------------------- líneas del editor

export interface DraftItem {
  /** Clave local para el @for (las líneas aún no tienen id). */
  key: number;
  productId: string;
  sku: string;
  productName: string;
  unitCode: string;
  /** La unidad base acepta decimales (m², kg…): solo así se cobra por medidas. */
  allowsDecimals: boolean;
  taxRate: number;
  description: string;
  bySize: boolean;
  width: number | null;
  length: number | null;
  quantity: number | null;
  unitPrice: number | null;
}

/** Medidas a 3 decimales, como las guarda el servidor. */
export function side(value: number | null): number | null {
  return value === null || !(Number(value) > 0) ? null : Math.round(Number(value) * 1000) / 1000;
}

/** Cantidad de la línea: ancho × largo (m²) o la escrita. Null si falta algo. */
export function draftQuantity(item: DraftItem): number | null {
  if (item.bySize) {
    const w = side(item.width);
    const l = side(item.length);
    return w === null || l === null ? null : quantity4(w * l);
  }
  const q = Number(item.quantity);
  return item.quantity === null || !(q > 0) ? null : quantity4(q);
}

/** Total estimado de la línea (el servidor lo recalcula con el impuesto vigente). */
export function draftTotal(item: DraftItem, pricesIncludeTax: boolean): number {
  const quantity = draftQuantity(item);
  const price = Number(item.unitPrice ?? 0);
  return quantity === null || !(price > 0) ? 0 : lineAmounts(price, quantity, 0, item.taxRate, pricesIncludeTax).total;
}

/** Primer problema de las líneas, para mostrarlo junto al botón Guardar; null si están bien. */
export function draftProblem(items: readonly DraftItem[]): string | null {
  if (items.length === 0) {
    return 'Agrega al menos un producto o servicio.';
  }
  for (const item of items) {
    if (item.bySize) {
      if (side(item.width) === null || side(item.length) === null) {
        return `Escribe el ancho y el largo de ${item.productName}.`;
      }
      if (Number(item.width) > 100 || Number(item.length) > 100) {
        return `Las medidas de ${item.productName} van en metros (máximo 100).`;
      }
    }
    const quantity = draftQuantity(item);
    if (quantity === null) {
      return `Escribe la cantidad de ${item.productName}.`;
    }
    if (!item.allowsDecimals && !Number.isInteger(quantity)) {
      return `${item.productName} se vende en unidades enteras (${item.unitCode}).`;
    }
    if (!(Number(item.unitPrice ?? 0) > 0)) {
      return `Escribe el precio de ${item.productName}.`;
    }
  }
  return null;
}

/** "1,2 × 0,6 m = 0,72 M2" o "3 UND". */
export function sizeText(item: { width: number | null; length: number | null; quantity: number; unitCode: string }): string {
  const qty = `${formatQuantity(item.quantity)} ${item.unitCode}`;
  return item.width !== null && item.length !== null
    ? `${formatQuantity(item.width)} × ${formatQuantity(item.length)} m = ${qty}`
    : qty;
}

// ---------------------------------------------------------------- entrega

/** Lo que se cobra al entregar: el anticipo disponible cubre primero y el resto lo paga el cliente. */
export function deliveryAmounts(order: Pick<Order, 'depositAvailable' | 'items'>, itemIds: ReadonlySet<string>):
  { total: number; applied: number; remaining: number; leftover: number; completes: boolean } {
  const pending = order.items.filter((i) => !i.delivered);
  const chosen = pending.filter((i) => itemIds.has(i.id));
  const total = chosen.reduce((sum, i) => sum + i.total, 0);
  const available = Math.max(0, order.depositAvailable);
  const applied = Math.min(available, total);
  const completes = chosen.length > 0 && chosen.length === pending.length;
  return { total, applied, remaining: pesos(total - applied), leftover: completes ? available - applied : 0, completes };
}

// ---------------------------------------------------------------- comprobante por WhatsApp

/** Mensaje del comprobante: qué se pidió, cuándo se entrega, lo abonado y lo que falta. */
export function orderMessage(order: Order, businessName: string): string {
  const lines = order.items.map((i) => {
    const name = i.description ? `${i.productName} · ${i.description}` : i.productName;
    return `• ${name} (${sizeText(i)}): ${formatCop(i.total)}${i.delivered ? ' ✓ entregado' : ''}`;
  });
  const firstName = order.customerName.trim().split(/\s+/)[0] ?? '';
  const status = order.status === 'CANCELLED' ? ' (cancelado)' : order.status === 'DELIVERED' ? ' (entregado)' : '';
  return [
    `Hola ${firstName}, te saludamos de ${businessName}. Este es el comprobante de tu pedido ${order.number}${status}:`,
    ...lines,
    `Total: ${formatCop(order.total)}`,
    `Abonado: ${formatCop(order.deposited)}`,
    ...(order.status === 'OPEN' ? [`Falta por pagar: ${formatCop(order.balanceDue)}`,
      `Entrega: ${formatDay(order.dueDate)}`] : []),
    '¡Gracias!',
  ].join('\n');
}

export function orderWhatsAppLink(order: Order, businessName: string): string {
  const number = whatsAppNumber(order.customerPhone);
  const text = encodeURIComponent(orderMessage(order, businessName));
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}
