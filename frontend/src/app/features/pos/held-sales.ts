import { CartLine } from './sale-math';

/**
 * Ventas en espera ("Pausar venta"): el carrito se guarda en localStorage de este equipo, por negocio y usuario, para
 * atender a otro cliente y retomarlo después (p. ej. mientras se registra al cliente). No va al servidor: no es una
 * venta ni aparta existencias. Al retomarla, el POS vuelve a pedir el precio de cada línea.
 * Lo guardado se valida al leerlo (puede venir de otra versión o estar dañado) y vence a los {@link HELD_TTL_DAYS} días.
 */
export const MAX_HELD = 10;
export const HELD_TTL_DAYS = 7;
const HELD_TTL_MS = HELD_TTL_DAYS * 24 * 60 * 60 * 1000;
const MAX_LABEL = 60;

export interface HeldCustomer {
  id: string;
  name: string;
  document: string;
  priceListId: string | null;
}

export interface HeldSale {
  id: string;
  label: string;
  /** ISO 8601. */
  heldAt: string;
  customer: HeldCustomer;
  lines: CartLine[];
}

export function heldKey(tenantId: string, userId: string): string {
  return `pos.held.${tenantId}.${userId}`;
}

export function loadHeld(tenantId: string | null, userId: string | null, now: number = Date.now(),
                         storage: Storage | null = defaultStorage()): HeldSale[] {
  if (!tenantId || !userId) {
    return [];
  }
  try {
    const raw = storage?.getItem(heldKey(tenantId, userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isHeldSale).filter((h) => isFresh(h, now)).slice(0, MAX_HELD);
  } catch {
    return [];
  }
}

export function saveHeld(tenantId: string | null, userId: string | null, list: readonly HeldSale[],
                         storage: Storage | null = defaultStorage()): void {
  if (!tenantId || !userId) {
    return;
  }
  try {
    if (list.length === 0) {
      storage?.removeItem(heldKey(tenantId, userId));
    } else {
      storage?.setItem(heldKey(tenantId, userId), JSON.stringify(list.slice(0, MAX_HELD)));
    }
  } catch {
    // Sin almacenamiento (modo privado, lleno): las ventas en espera duran mientras la pantalla siga abierta.
  }
}

/**
 * Nombre sugerido, sin repetir uno que ya esté en espera: el del cliente ("Marta Gómez", "Marta Gómez (2)") o
 * "Venta en espera N" con el primer número libre.
 */
export function defaultHoldLabel(customerName: string, finalConsumer: boolean, list: readonly HeldSale[]): string {
  const used = new Set(list.map((h) => h.label));
  const name = customerName.trim().slice(0, MAX_LABEL - 5);
  if (!finalConsumer && name) {
    if (!used.has(name)) {
      return name;
    }
    let copy = 2;
    while (used.has(`${name} (${copy})`)) {
      copy++;
    }
    return `${name} (${copy})`;
  }
  let n = 1;
  while (used.has(`Venta en espera ${n}`)) {
    n++;
  }
  return `Venta en espera ${n}`;
}

export function newHeldSale(label: string, customer: HeldCustomer, lines: readonly CartLine[], now: number = Date.now()): HeldSale {
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: label.trim().slice(0, MAX_LABEL),
    heldAt: new Date(now).toISOString(),
    customer: { ...customer },
    lines: lines.map((l) => ({ ...l })),
  };
}

/** "hace un momento", "hace 5 min", "hace 2 h", "hace 3 d". */
export function heldAge(heldAt: string, now: number = Date.now()): string {
  const minutes = Math.floor(Math.max(now - Date.parse(heldAt), 0) / 60000);
  if (minutes < 1) {
    return 'hace un momento';
  }
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} d`;
}

function isFresh(sale: HeldSale, now: number): boolean {
  const at = Date.parse(sale.heldAt);
  return Number.isFinite(at) && now - at <= HELD_TTL_MS;
}

function isHeldSale(value: unknown): value is HeldSale {
  if (!isRecord(value)) {
    return false;
  }
  const customer = value['customer'];
  const lines = value['lines'];
  return typeof value['id'] === 'string' && typeof value['label'] === 'string' && typeof value['heldAt'] === 'string'
    && isRecord(customer) && typeof customer['id'] === 'string' && typeof customer['name'] === 'string'
    && typeof customer['document'] === 'string'
    && (customer['priceListId'] === null || typeof customer['priceListId'] === 'string')
    && Array.isArray(lines) && lines.length > 0 && lines.every(isCartLine);
}

function isCartLine(value: unknown): value is CartLine {
  if (!isRecord(value)) {
    return false;
  }
  const quantity = value['quantity'];
  const factor = value['factor'];
  return ['key', 'productId', 'sku', 'name', 'unitId', 'unitCode'].every((k) => typeof value[k] === 'string')
    && typeof quantity === 'number' && quantity > 0
    && ['unitPrice', 'discountPercent', 'taxRate'].every((k) => typeof value[k] === 'number' && Number.isFinite(value[k]))
    && typeof value['trackInventory'] === 'boolean'
    && (factor === undefined || (typeof factor === 'number' && factor > 0))
    && (value['openPrice'] === undefined || typeof value['openPrice'] === 'boolean');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
