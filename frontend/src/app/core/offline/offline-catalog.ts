import { Category, OfflineCatalogItem, OfflineCategory, Product, ProductLookup } from '../api/api.models';

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

/** La categoría y todas las que cuelgan de ella (como filtra el servidor). */
function withDescendants(categories: readonly OfflineCategory[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * Los productos de la copia para la cuadrícula de Vender sin internet (decisión 353): uno por producto (su unidad
 * base), por nombre, de la categoría pedida y sus subcategorías (null = todos). Son tarjetas: solo traen lo que pinta
 * la cuadrícula y el id con que Vender lo agrega desde la misma copia.
 */
export function gridProducts(items: readonly OfflineCatalogItem[], categories: readonly OfflineCategory[],
                             categoryId: string | null): Product[] {
  const allowed = categoryId === null ? null : withDescendants(categories, categoryId);
  const seen = new Set<string>();
  const out: Product[] = [];
  for (const item of items) {
    if (item.factor !== 1 || seen.has(item.productId)) {
      continue;
    }
    if (allowed && !(item.categoryId && allowed.has(item.categoryId))) {
      continue;
    }
    seen.add(item.productId);
    out.push({
      id: item.productId, sku: item.sku, name: item.name, salePrice: item.price, openPrice: item.openPrice,
      trackInventory: item.trackInventory, active: true, categoryId: item.categoryId ?? null, modelId: null,
    } as unknown as Product);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

/** Las categorías de la copia como las de la cuadrícula (decisión 353). */
export function gridCategories(categories: readonly OfflineCategory[]): Category[] {
  return categories.map((c) => ({ id: c.id, parentId: c.parentId, name: c.name, active: true }) as unknown as Category);
}
