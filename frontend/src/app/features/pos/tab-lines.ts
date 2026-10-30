import { Tab } from '../../core/api/dining.api';
import { CartLine } from './sale-math';

/**
 * Productos de una cuenta de mesa como líneas del carrito para cobrarla (Fase 12b-2). El precio y el impuesto se
 * completan enseguida con el vigente (refreshPrices); en precio libre se conserva el que se escribió al pedir.
 */
export function tabLines(tab: Tab): CartLine[] {
  return tab.items.filter((i) => !i.voided).map((i) => ({
    key: i.id,
    productId: i.productId,
    sku: '',
    name: i.name,
    unitId: i.unitId ?? '',
    unitCode: '',
    quantity: Number(i.quantity),
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
