/** Espera tras un cierre normal (cada 10 min): entre 0,5 y 3 s, para que las pantallas no lleguen todas juntas. */
export const NORMAL_MIN_MS = 500;
export const NORMAL_SPREAD_MS = 2500;
/** Tope de la espera creciente cuando algo falla. */
export const MAX_WAIT_MS = 30_000;
/** Una conexión que se cae antes de esto sin decir por qué cuenta como fallo (evita reconectar en bucle). */
export const QUICK_CLOSE_MS = 5000;

/**
 * Cuánto esperar antes de volver a conectar a los avisos en vivo (decisión 291). Sin fallos, entre 0,5 y 3 s; con
 * fallos, 1 s, 2 s, 4 s… hasta 30 s, cada una entre la mitad y una vez y media (así varias pantallas no se reconectan
 * al mismo tiempo); con 429, nunca antes de lo que pidió el servidor. {@code random} entre 0 y 1.
 */
export function reconnectDelay(failures: number, retryAfterMs: number, random: number): number {
  if (failures <= 0) {
    return Math.round(NORMAL_MIN_MS + random * NORMAL_SPREAD_MS);
  }
  const base = Math.min(MAX_WAIT_MS, 1000 * 2 ** Math.min(failures - 1, 5));
  const wait = Math.round(base * (0.5 + random));
  return retryAfterMs > 0 ? Math.max(wait, Math.round(retryAfterMs + random * 5000)) : wait;
}

/** Segundos de la cabecera Retry-After en milisegundos (60 s si no viene o no se entiende). */
export function retryAfterMs(header: string | null): number {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 300) * 1000 : 60_000;
}

/** Identificador de esta pestaña para el servidor (no es secreto ni dice nada del usuario). */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
