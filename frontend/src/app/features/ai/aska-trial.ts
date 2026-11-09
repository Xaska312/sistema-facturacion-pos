import { AiTrial } from '../../core/api/ai.api';

/** Prueba gratis de XASKA IA (decisión 311): la bienvenida sale una vez por negocio en cada equipo. */
const KEY = 'xaska.aska-welcome.';

export function welcomeSeen(tenantId: string): boolean {
  try {
    return localStorage.getItem(KEY + tenantId) === '1';
  } catch {
    return true;
  }
}

export function markWelcomeSeen(tenantId: string): void {
  try {
    localStorage.setItem(KEY + tenantId, '1');
  } catch {
    // Sin almacenamiento: se vuelve a ver la próxima vez, no pasa nada.
  }
}

/** "Te queda 1 día", "Te quedan 9 días", "Último día". */
export function daysLeftText(days: number): string {
  if (days <= 0) {
    return 'Último día';
  }
  return days === 1 ? 'Te queda 1 día' : `Te quedan ${days} días`;
}

/** Cuántos de los tres retos ya hizo. */
export function challengesDone(t: AiTrial): number {
  return [t.scanned, t.asked, t.loaded].filter(Boolean).length;
}
