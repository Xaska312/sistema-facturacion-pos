import { UI_PREF_KEYS, readUiPref, writeUiPref } from './ui-prefs';

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

class BrokenStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error('SecurityError');
  }
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

describe('ui-prefs', () => {
  it('guarda y lee una preferencia', () => {
    const storage = new MemoryStorage();
    writeUiPref(UI_PREF_KEYS.theme, 'dark', storage);
    expect(readUiPref(UI_PREF_KEYS.theme, storage)).toBe('dark');
  });

  it('devuelve null si no hay valor o no hay almacenamiento', () => {
    expect(readUiPref(UI_PREF_KEYS.theme, new MemoryStorage())).toBeNull();
    expect(readUiPref(UI_PREF_KEYS.theme, null)).toBeNull();
  });

  it('no falla si el almacenamiento lanza error (modo privado, bloqueado)', () => {
    const storage = new BrokenStorage();
    expect(() => writeUiPref(UI_PREF_KEYS.sidebarCollapsed, 'true', storage)).not.toThrow();
    expect(readUiPref(UI_PREF_KEYS.sidebarCollapsed, storage)).toBeNull();
  });
});
