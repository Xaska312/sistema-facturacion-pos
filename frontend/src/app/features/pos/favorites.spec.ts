import { MAX_FAVORITES, favoritesKey, loadFavorites, saveFavorites, toggleFavorite } from './favorites';

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

describe('favoritos del POS', () => {
  it('guarda y lee los ids por negocio', () => {
    const storage = new MemoryStorage();
    saveFavorites('t1', ['a', 'b'], storage);
    expect(loadFavorites('t1', storage)).toEqual(['a', 'b']);
    expect(loadFavorites('t2', storage)).toEqual([]);
    expect(storage.getItem(favoritesKey('t1'))).toBe('["a","b"]');
  });

  it('ignora datos dañados, sin negocio o sin almacenamiento', () => {
    const storage = new MemoryStorage();
    storage.setItem(favoritesKey('t1'), '{no es json');
    expect(loadFavorites('t1', storage)).toEqual([]);
    storage.setItem(favoritesKey('t1'), '["a", 3, ""]');
    expect(loadFavorites('t1', storage)).toEqual(['a']);
    expect(loadFavorites(null, storage)).toEqual([]);
    expect(loadFavorites('t1', null)).toEqual([]);
    const failing = new MemoryStorage();
    failing.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => saveFavorites('t1', ['a'], failing)).not.toThrow();
  });

  it('agrega al inicio, quita y respeta el máximo', () => {
    expect(toggleFavorite(['a'], 'b')).toEqual(['b', 'a']);
    expect(toggleFavorite(['b', 'a'], 'b')).toEqual(['a']);
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => `p${i}`);
    const next = toggleFavorite(full, 'nuevo');
    expect(next.length).toBe(MAX_FAVORITES);
    expect(next[0]).toBe('nuevo');
    expect(next).not.toContain(`p${MAX_FAVORITES - 1}`);
  });
});
