import { Product, ProductModelRow } from '../../core/api/api.models';

/**
 * Tarjeta de la cuadrícula del POS: un producto, o un modelo con tallas (fase 8d) que al tocarlo pide la talla. Así
 * "Tenis Runner" ocupa una tarjeta y no una por cada talla y color.
 */
export type GridCard =
  | { kind: 'product'; id: string; name: string; product: Product }
  | { kind: 'model'; id: string; name: string; model: ProductModelRow };

/**
 * Productos sueltos y modelos en una sola lista por nombre. Las tallas sueltas no salen: van dentro de su modelo.
 * Con {@code upTo}, solo hasta ese nombre: productos y modelos llegan en páginas por separado y lo que viene después del
 * último nombre de una fuente con más páginas esperaría a "Ver más" (si no, las tarjetas cambiarían de lugar).
 */
export function gridCards(products: readonly Product[], models: readonly ProductModelRow[], upTo: string | null = null)
  : GridCard[] {
  const cards: GridCard[] = [
    ...products.filter((p) => !p.modelId).map((p) => ({ kind: 'product' as const, id: p.id, name: p.name, product: p })),
    ...models.map((m) => ({ kind: 'model' as const, id: m.id, name: m.name, model: m })),
  ];
  const sorted = cards.sort((a, b) => byName(a.name, b.name));
  return upTo === null ? sorted : sorted.filter((c) => byName(c.name, upTo) <= 0);
}

/** El primero en orden alfabético de los nombres dados (null si no hay ninguno). */
export function firstName(names: readonly (string | null)[]): string | null {
  return names.filter((n): n is string => n !== null).sort(byName)[0] ?? null;
}

function byName(a: string, b: string): number {
  return a.localeCompare(b, 'es', { sensitivity: 'base' });
}

/**
 * Nombre del modelo a partir del de una talla ("Tenis Runner T38 Negro" → "Tenis Runner"), como lo arma el servidor
 * (las tallas en letras van sin la T). Si el nombre no tiene esa forma, se deja igual.
 */
export function modelNameOf(product: Pick<Product, 'name' | 'variantSize' | 'variantColor'>): string {
  const size = product.variantSize;
  if (!size) {
    return product.name;
  }
  const sizeText = /^\d/.test(size) ? `T${size}` : size;
  const suffix = ` ${sizeText}${product.variantColor ? ' ' + product.variantColor : ''}`;
  return product.name.endsWith(suffix) ? product.name.slice(0, -suffix.length) : product.name;
}

/** Fila de la búsqueda (F2): un producto, o un modelo que agrupa las tallas encontradas. */
export type SearchRow =
  | { kind: 'product'; id: string; product: Product }
  | { kind: 'model'; id: string; name: string; salePrice: number; matches: number };

/** Resultados de la búsqueda por nombre: productos sin tallas y modelos, juntos por nombre. */
export function searchRows(products: readonly Product[], models: readonly ProductModelRow[]): SearchRow[] {
  return gridCards(products, models).map((card): SearchRow => card.kind === 'model'
    ? { kind: 'model', id: card.id, name: card.name, salePrice: card.model.salePrice, matches: card.model.variants }
    : { kind: 'product', id: card.id, product: card.product });
}

/** Junta las tallas de un mismo modelo en una fila (en el lugar de la primera que apareció). */
export function groupSearchResults(products: readonly Product[]): SearchRow[] {
  const rows: SearchRow[] = [];
  const models = new Map<string, Extract<SearchRow, { kind: 'model' }>>();
  for (const product of products) {
    if (!product.modelId) {
      rows.push({ kind: 'product', id: product.id, product });
      continue;
    }
    const existing = models.get(product.modelId);
    if (existing) {
      existing.matches++;
      continue;
    }
    const row = {
      kind: 'model' as const,
      id: product.modelId,
      name: modelNameOf(product),
      salePrice: product.salePrice,
      matches: 1,
    };
    models.set(product.modelId, row);
    rows.push(row);
  }
  return rows;
}
