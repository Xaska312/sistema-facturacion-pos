/**
 * Recorrido guiado corto (máx. 5 pasos) que señala partes de una pantalla. Cada paso apunta a un elemento con
 * {@code data-tour="…"}; si no está en la página, el paso se muestra centrado.
 */
export type TourId = 'dashboard' | 'pos';

export interface TourStep {
  /** Valor de {@code data-tour} del elemento a resaltar; null = paso centrado. */
  target: string | null;
  title: string;
  text: string;
}

export interface TourDefinition {
  id: TourId;
  steps: readonly TourStep[];
}

export const MAX_TOUR_STEPS = 5;

/** Recorridos ya vistos por un usuario, en este equipo (preferencia de interfaz). */
export function toursKey(userId: string): string {
  return `pos.tours.${userId}`;
}

export function readSeenTours(key: string, storage: Storage | null = defaultStorage()): TourId[] {
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isTourId) : [];
  } catch {
    return [];
  }
}

export function markTourSeen(key: string, id: TourId, storage: Storage | null = defaultStorage()): void {
  const seen = readSeenTours(key, storage);
  if (seen.includes(id)) {
    return;
  }
  try {
    storage?.setItem(key, JSON.stringify([...seen, id]));
  } catch {
    // Sin almacenamiento: el recorrido se volverá a ofrecer en la próxima visita.
  }
}

function isTourId(value: unknown): value is TourId {
  return value === 'dashboard' || value === 'pos';
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
