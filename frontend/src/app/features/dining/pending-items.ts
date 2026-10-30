import { TabItemInput } from '../../core/api/dining.api';
import { CartModifier, lineKey, linePrice } from '../pos/sale-math';

/**
 * Lo que se está pidiendo en la cuenta y aún no se agregó (Fase 12b-2). El mismo producto con las mismas adiciones y
 * nota suma cantidad; con otras, va aparte (como en el carrito del POS).
 */
export interface PendingItem {
  key: string;
  productId: string;
  unitId: string | null;
  name: string;
  quantity: number;
  /** Precio del producto sin adiciones (en precio libre, el escrito). */
  basePrice: number;
  openPrice: boolean;
  modifiers: CartModifier[];
  note: string;
}

export function addPending(list: readonly PendingItem[], item: Omit<PendingItem, 'key'>): PendingItem[] {
  // Cada producto de precio libre va aparte (dos impresiones pueden tener precios distintos).
  const key = item.openPrice
    ? `${item.productId}|${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    : lineKey(item.productId, item.unitId ?? '', item.modifiers, item.note);
  const existing = list.find((p) => p.key === key);
  if (existing) {
    return list.map((p) => (p === existing ? { ...p, quantity: p.quantity + item.quantity } : p));
  }
  return [...list, { ...item, key }];
}

/** Una unidad más o menos; en cero sale de la lista. */
export function stepPending(list: readonly PendingItem[], key: string, delta: number): PendingItem[] {
  return list
    .map((p) => (p.key === key ? { ...p, quantity: p.quantity + delta } : p))
    .filter((p) => p.quantity > 0);
}

/** Precio por unidad con adiciones (como se verá en la cuenta). */
export function pendingPrice(item: PendingItem): number {
  return linePrice({ unitPrice: item.basePrice, modifiers: item.modifiers });
}

export function pendingTotal(list: readonly PendingItem[]): number {
  return list.reduce((sum, p) => sum + Math.round(pendingPrice(p) * p.quantity), 0);
}

export function toItemInputs(list: readonly PendingItem[]): TabItemInput[] {
  return list.map((p) => ({
    productId: p.productId,
    unitId: p.unitId,
    quantity: p.quantity,
    ...(p.openPrice ? { unitPrice: p.basePrice } : {}),
    ...(p.modifiers.length > 0 ? { modifiers: p.modifiers.map((m) => ({ optionId: m.optionId, quantity: m.quantity })) } : {}),
    ...(p.note ? { note: p.note } : {}),
  }));
}
