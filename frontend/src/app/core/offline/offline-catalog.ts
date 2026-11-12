import { OfflineCatalogItem, ProductLookup } from '../api/api.models';

/** Búsquedas sobre la copia del catálogo para vender sin internet (decisión 332). Funciones puras para probarlas. */
export function lookupFromItem(item: OfflineCatalogItem): ProductLookup {
  return {
    productId: item.productId,
    sku: item.sku,
    name: item.name,
    unitId: item.unitId,
    unitCode: item.unitCode,
    factor: item.factor,
    price: item.price,
    priceListId: null,
    fromList: false,
    taxId: item.taxId,
    taxType: item.taxType,
    taxRate: item.taxRate,
    trackInventory: item.trackInventory,
    openPrice: item.openPrice,
    scaleQuantity: null,
    scaleAmount: null,
  };
}

/** Código de barras o SKU exacto (sin distinguir mayúsculas). */
export function findByCode(items: readonly OfflineCatalogItem[], code: string): OfflineCatalogItem | null {
  const wanted = code.trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  return items.find((i) => i.codes.some((c) => c.toLowerCase() === wanted)) ?? null;
}

/** La presentación pedida del producto, o la unidad base. */
export function findByProduct(items: readonly OfflineCatalogItem[], productId: string,
                              unitId: string | null): OfflineCatalogItem | null {
  const own = items.filter((i) => i.productId === productId);
  return own.find((i) => i.unitId === unitId) ?? own.find((i) => i.factor === 1) ?? own[0] ?? null;
}

function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Productos (en su unidad base) cuyo nombre o SKU contiene todas las palabras buscadas; hasta {@code limit}. */
export function searchItems(items: readonly OfflineCatalogItem[], text: string, limit = 20): OfflineCatalogItem[] {
  const words = plain(text).split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return [];
  }
  const out: OfflineCatalogItem[] = [];
  for (const item of items) {
    if (item.factor !== 1) {
      continue;
    }
    const haystack = plain(`${item.name} ${item.sku}`);
    if (words.every((w) => haystack.includes(w))) {
      out.push(item);
      if (out.length >= limit) {
        break;
      }
    }
  }
  return out;
}
