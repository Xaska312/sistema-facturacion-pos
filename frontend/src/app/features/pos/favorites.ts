/**
 * Productos favoritos del POS, por negocio, en localStorage de este equipo. Solo se guardan los ids (es una
 * preferencia de interfaz, como el tema): nombre, precio y existencia se piden al servidor cada vez.
 * Si el almacenamiento no está disponible, se lee una lista vacía y la escritura se ignora.
 */
export const MAX_FAVORITES = 24;

export function favoritesKey(tenantId: string): string {
  return `pos.favorites.${tenantId}`;
}

export function loadFavorites(tenantId: string | null, storage: Storage | null = defaultStorage()): string[] {
  if (!tenantId) {
    return [];
  }
  try {
    const raw = storage?.getItem(favoritesKey(tenantId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, MAX_FAVORITES)
      : [];
  } catch {
    return [];
  }
}

export function saveFavorites(tenantId: string | null, ids: readonly string[], storage: Storage | null = defaultStorage()): void {
  if (!tenantId) {
    return;
  }
  try {
    storage?.setItem(favoritesKey(tenantId), JSON.stringify(ids.slice(0, MAX_FAVORITES)));
  } catch {
    // Sin almacenamiento: los favoritos duran solo esta sesión.
  }
}

/** Agrega al inicio o quita; al pasar del máximo se descarta el más antiguo. */
export function toggleFavorite(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids].slice(0, MAX_FAVORITES);
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
