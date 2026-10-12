import { ProductModel, ProductVariant } from '../../../core/api/api.models';

/**
 * Cuadrícula talla × color de un modelo (fase 8d): filas = colores (una sola fila sin color si el modelo no maneja
 * colores), columnas = tallas en el orden de la escala.
 */
export interface ModelGrid {
  colors: (string | null)[];
  sizes: string[];
  /** Variante en esa fila y columna, o undefined si esa combinación no existe. */
  at(color: string | null, size: string): ProductVariant | undefined;
}

export function modelGrid(model: ProductModel): ModelGrid {
  const byKey = new Map<string, ProductVariant>();
  for (const v of model.variants) {
    byKey.set(key(v.color, v.size), v);
  }
  return {
    colors: model.colors.length > 0 ? model.colors : [null],
    sizes: model.sizes,
    at: (color, size) => byKey.get(key(color, size)),
  };
}

/**
 * "negro, blanco ,  Azul cielo, Negro" → ["Negro", "Blanco", "Azul cielo"]: sin vacíos ni repetidos y con mayúscula
 * inicial, como los guarda el servidor.
 */
export function parseColors(text: string): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const raw of text.split(',')) {
    const color = raw.trim().replace(/\s+/g, ' ');
    if (color && !seen.has(color.toLowerCase())) {
      seen.add(color.toLowerCase());
      colors.push(color.charAt(0).toUpperCase() + color.slice(1));
    }
  }
  return colors;
}

/** Cuántas variantes nuevas salen de esas tallas y colores (las que ya existen no cuentan). */
export function newVariantCount(model: ProductModel | null, sizes: string[], colors: string[]): number {
  const rows: (string | null)[] = colors.length > 0 ? colors : [null];
  if (!model) {
    return sizes.length * rows.length;
  }
  const existing = new Set(model.variants.map((v) => key(v.color, v.size)));
  let count = 0;
  for (const color of rows) {
    for (const size of sizes) {
      if (!existing.has(key(color, size))) {
        count++;
      }
    }
  }
  return count;
}

/** Cantidades escritas en la cuadrícula → líneas {variante, cantidad} (vacías y negativas se ignoran). */
export function gridQuantities(model: ProductModel, quantities: Readonly<Record<string, number | null>>)
  : { variant: ProductVariant; quantity: number }[] {
  const lines: { variant: ProductVariant; quantity: number }[] = [];
  for (const variant of model.variants) {
    const value = quantities[variant.productId];
    if (value !== null && value !== undefined && String(value) !== '' && Number(value) >= 0 && !Number.isNaN(Number(value))) {
      lines.push({ variant, quantity: Number(value) });
    }
  }
  return lines;
}

/** Mayúsculas sin tildes, solo letras, números y punto (como {@code CatalogVariants.token} del servidor). */
export function skuToken(text: string, max: number): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, max);
}

/**
 * Ejemplo de la primera variante que se va a crear, como la arma el servidor: "RUN-38-NEGRO" / "Tenis Runner T38 Negro"
 * (las tallas en letras van sin la T: "Camiseta XL").
 */
export function variantExample(prefix: string, name: string, size: string, color: string | null)
  : { sku: string; name: string } {
  const sku = `${prefix.trim().toUpperCase()}-${skuToken(size, 10)}${color ? '-' + skuToken(color, 6) : ''}`;
  const sizeText = /^\d/.test(size) ? `T${size}` : size;
  return { sku, name: `${name.trim()} ${sizeText}${color ? ' ' + color : ''}` };
}

function key(color: string | null, size: string): string {
  return `${(color ?? '').toLowerCase()}|${size}`;
}
