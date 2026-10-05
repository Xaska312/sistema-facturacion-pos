/**
 * Preferencias de interfaz en localStorage (tema, menú contraído…). Nunca datos de sesión:
 * el token vive en memoria y el refresh en una cookie HttpOnly.
 *
 * localStorage puede no existir o lanzar error (modo privado, almacenamiento bloqueado): en ese caso
 * se lee null y la escritura se ignora, y la app sigue con los valores por defecto.
 */
export const UI_PREF_KEYS = {
  theme: 'pos.theme',
  sidebarCollapsed: 'pos.sidebar-collapsed',
} as const;

export type UiPrefKey = (typeof UI_PREF_KEYS)[keyof typeof UI_PREF_KEYS];

export function readUiPref(key: UiPrefKey, storage: Storage | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeUiPref(key: UiPrefKey, value: string, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Sin almacenamiento: la preferencia dura solo esta sesión.
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
