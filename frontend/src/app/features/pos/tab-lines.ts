import { ChargePart, Tab } from '../../core/api/dining.api';
import { CartLine } from './sale-math';

/**
 * Productos de una cuenta de mesa como líneas del carrito para cobrarla (Fase 12b-2). El precio y el impuesto se
 * completan enseguida con el vigente (refreshPrices); en precio libre se conserva el que se escribió al pedir. Solo lo
 * pendiente (ni quitado ni cobrado); con {@code parts} (cobro por productos, Fase 12b-5), solo esas líneas y cantidades.
 */
export function tabLines(tab: Tab, parts: readonly ChargePart[] | null = null): CartLine[] {
  const wanted = parts ? new Map(parts.map((p) => [p.itemId, p.quantity])) : null;
  return tab.items.filter((i) => !i.voided && !i.saleId && (!wanted || wanted.has(i.id))).map((i) => ({
    key: i.id,
    productId: i.productId,
    sku: '',
    name: i.name,
    unitId: i.unitId ?? '',
    unitCode: '',
    quantity: wanted ? Math.min(Number(wanted.get(i.id)), Number(i.quantity)) : Number(i.quantity),
    unitPrice: Number(i.basePrice),
    discountPercent: 0,
    taxRate: 0,
    trackInventory: false,
    ...(i.openPrice ? { openPrice: true } : {}),
    ...(i.modifiers.length > 0
      ? { modifiers: i.modifiers.map((m) => ({ optionId: m.optionId, groupName: m.groupName, name: m.name, quantity: m.quantity, price: Number(m.price) })) }
      : {}),
    ...(i.note ? { note: i.note } : {}),
  }));
}

/** "id:2,id2:1" (en la dirección de Vender) ↔ partes a cobrar. */
export function encodeParts(parts: readonly ChargePart[]): string {
  return parts.filter((p) => p.quantity > 0).map((p) => `${p.itemId}:${p.quantity}`).join(',');
}

export function decodeParts(value: string | null): ChargePart[] | null {
  if (!value) {
    return null;
  }
  const parts = value.split(',').map((chunk) => {
    const [itemId, quantity] = chunk.split(':');
    return { itemId, quantity: Number(quantity) };
  }).filter((p) => p.itemId && p.quantity > 0 && Number.isFinite(p.quantity));
  return parts.length > 0 ? parts : null;
}
