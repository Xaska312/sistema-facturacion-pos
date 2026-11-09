/**
 * Aska en el momento del dolor (decisión 308): cuándo sale el aviso y cuándo deja de salir. Cada momento se puede
 * cerrar ("Ahora no") y deja de salir en ese equipo al cerrarlo 3 veces o con "No volver a mostrar".
 */
export type AskaMoment = 'purchase' | 'products' | 'stock';

/** Desde esta línea digitada a mano se ofrece leer la factura con una foto. */
export const MANUAL_LINES_TRIGGER = 4;
/** Desde este producto creado a mano (seguidos, en esta sesión) se ofrece Cargar con Aska. */
export const MANUAL_PRODUCTS_TRIGGER = 3;
/** Cerrado esta cantidad de veces, no vuelve a salir. */
export const NUDGE_MAX_DISMISSALS = 3;

const KEY = 'xaska.aska-nudge.';

export function nudgeDismissals(moment: AskaMoment): number {
  try {
    return Number(localStorage.getItem(KEY + moment) ?? '0') || 0;
  } catch {
    return 0;
  }
}

export function nudgeHidden(moment: AskaMoment): boolean {
  return nudgeDismissals(moment) >= NUDGE_MAX_DISMISSALS;
}

/** "Ahora no" suma uno; "No volver a mostrar" lo apaga de una vez. */
export function dismissNudge(moment: AskaMoment, forever: boolean): void {
  try {
    const next = forever ? NUDGE_MAX_DISMISSALS : Math.min(NUDGE_MAX_DISMISSALS, nudgeDismissals(moment) + 1);
    localStorage.setItem(KEY + moment, String(next));
  } catch {
    // Sin almacenamiento (modo privado): solo se cierra esta vez.
  }
}
