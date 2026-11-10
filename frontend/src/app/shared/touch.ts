/**
 * Pantallas táctiles (decisión 314, modo teléfono): en el celular y la tablet nada abre el teclado solo; la persona
 * toca el campo cuando quiere escribir. En el computador el cursor queda listo (útil con lector de código de barras).
 */
export function isTouch(): boolean {
  try {
    return globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
}

/** Pone el cursor en el campo solo en el computador, sin mover la pantalla. */
export function focusOnDesktop(el: HTMLElement | null | undefined, select = false): void {
  if (!el || isTouch()) {
    return;
  }
  el.focus({ preventScroll: true });
  if (select && el instanceof HTMLInputElement) {
    el.select();
  }
}
