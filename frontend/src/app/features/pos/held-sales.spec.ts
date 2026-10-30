import {
  HELD_TTL_DAYS,
  HeldCustomer,
  MAX_HELD,
  defaultHoldLabel,
  heldAge,
  heldKey,
  loadHeld,
  newHeldSale,
  saveHeld,
} from './held-sales';
import { CartLine } from './sale-math';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const line = (id: string, over: Partial<CartLine> = {}): CartLine => ({
  key: `${id}|u`, productId: id, sku: id.toUpperCase(), name: `Producto ${id}`, unitId: 'u', unitCode: 'UND',
  quantity: 2, unitPrice: 2500, discountPercent: 0, taxRate: 19, trackInventory: true, ...over,
});

const finalConsumer: HeldCustomer = { id: 'cf', name: 'Consumidor final', document: '222222222222', priceListId: null };
const NOW = Date.parse('2026-10-16T15:00:00Z');

describe('ventas en espera del POS', () => {
  it('guarda y lee por negocio y usuario', () => {
    const storage = new MemoryStorage();
    const sale = newHeldSale('Señora Marta', finalConsumer, [line('a')], NOW);
    saveHeld('t1', 'u1', [sale], storage);

    expect(loadHeld('t1', 'u1', NOW, storage)).toEqual([sale]);
    expect(loadHeld('t1', 'u2', NOW, storage)).toEqual([]);
    expect(loadHeld('t2', 'u1', NOW, storage)).toEqual([]);
    expect(loadHeld(null, 'u1', NOW, storage)).toEqual([]);
  });

  it('copia las líneas: cambiar el carrito después no cambia la venta guardada', () => {
    const lines = [line('a')];
    const sale = newHeldSale('x', finalConsumer, lines, NOW);
    lines[0].quantity = 9;
    expect(sale.lines[0].quantity).toBe(2);
  });

  it('una lista vacía borra la clave', () => {
    const storage = new MemoryStorage();
    saveHeld('t1', 'u1', [newHeldSale('x', finalConsumer, [line('a')], NOW)], storage);
    saveHeld('t1', 'u1', [], storage);
    expect(storage.getItem(heldKey('t1', 'u1'))).toBeNull();
  });

  it('descarta lo dañado, lo vacío y lo vencido', () => {
    const storage = new MemoryStorage();
    const fresh = newHeldSale('fresca', finalConsumer, [line('a')], NOW - 60_000);
    const old = newHeldSale('vieja', finalConsumer, [line('b')], NOW - (HELD_TTL_DAYS + 1) * 86_400_000);
    const broken = { ...newHeldSale('rota', finalConsumer, [line('c')], NOW), lines: [{ ...line('c'), quantity: 'dos' }] };
    const badFactor = { ...newHeldSale('factor', finalConsumer, [line('e')], NOW), lines: [{ ...line('e'), factor: -3 }] };
    const empty = { ...newHeldSale('vacía', finalConsumer, [line('d')], NOW), lines: [] };
    storage.setItem(heldKey('t1', 'u1'), JSON.stringify([fresh, old, broken, badFactor, empty, 'basura', null]));

    expect(loadHeld('t1', 'u1', NOW, storage).map((h) => h.label)).toEqual(['fresca']);

    storage.setItem(heldKey('t1', 'u1'), '{no es json');
    expect(loadHeld('t1', 'u1', NOW, storage)).toEqual([]);
  });

  it('guarda las adiciones y la nota, y descarta adiciones dañadas (Fase 12b-1)', () => {
    const storage = new MemoryStorage();
    const withExtras = line('g', {
      note: 'sin azúcar',
      modifiers: [{ optionId: 'o1', groupName: 'Tamaño', name: 'Grande', quantity: 1, price: 4000 }],
    });
    const good = newHeldSale('granizado', finalConsumer, [withExtras], NOW);
    const bad = { ...newHeldSale('mala', finalConsumer, [line('h')], NOW),
      lines: [{ ...line('h'), modifiers: [{ optionId: 'o1', name: 'Grande', quantity: 0, price: 4000 }] }] };
    storage.setItem(heldKey('t1', 'u1'), JSON.stringify([good, bad]));
    const loaded = loadHeld('t1', 'u1', NOW, storage);
    expect(loaded.map((h) => h.label)).toEqual(['granizado']);
    expect(loaded[0].lines[0].modifiers?.[0].name).toBe('Grande');
    expect(loaded[0].lines[0].note).toBe('sin azúcar');
  });

  it('no guarda más del máximo', () => {
    const storage = new MemoryStorage();
    const many = Array.from({ length: MAX_HELD + 3 }, (_, i) => newHeldSale(`v${i}`, finalConsumer, [line('a')], NOW));
    saveHeld('t1', 'u1', many, storage);
    expect(loadHeld('t1', 'u1', NOW, storage).length).toBe(MAX_HELD);
  });

  it('sin almacenamiento no falla', () => {
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); } } as unknown as Storage;
    expect(() => saveHeld('t1', 'u1', [newHeldSale('x', finalConsumer, [line('a')], NOW)], broken)).not.toThrow();
    expect(loadHeld('t1', 'u1', NOW, broken)).toEqual([]);
  });

  it('sugiere el nombre del cliente o el primer "Venta en espera N" libre', () => {
    expect(defaultHoldLabel('Marta Gómez', false, [])).toBe('Marta Gómez');
    const marta = [newHeldSale('Marta Gómez', finalConsumer, [line('a')], NOW)];
    expect(defaultHoldLabel('Marta Gómez', false, marta)).toBe('Marta Gómez (2)');
    expect(defaultHoldLabel('Consumidor final', true, [])).toBe('Venta en espera 1');
    const taken = [newHeldSale('Venta en espera 1', finalConsumer, [line('a')], NOW),
      newHeldSale('Venta en espera 3', finalConsumer, [line('a')], NOW)];
    expect(defaultHoldLabel('Consumidor final', true, taken)).toBe('Venta en espera 2');
  });

  it('dice hace cuánto se pausó', () => {
    expect(heldAge(new Date(NOW - 20_000).toISOString(), NOW)).toBe('hace un momento');
    expect(heldAge(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('hace 5 min');
    expect(heldAge(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe('hace 3 h');
    expect(heldAge(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe('hace 2 d');
  });
});
