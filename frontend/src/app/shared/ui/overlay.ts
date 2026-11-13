import { EmbeddedViewRef, TemplateRef, ViewContainerRef } from '@angular/core';
import { ZIndexUtils } from 'primeng/utils';

/**
 * Utilidades de las capas flotantes propias (menú, popover, tooltip, avisos; decisión 339).
 * Las capas siguen la misma cuenta de z-index que PrimeNG (`ZIndexUtils`) mientras queden piezas suyas; en la fase D
 * se cambia por una copia propia.
 */
export const OVERLAY_Z_INDEX = 1000;
export const MODAL_Z_INDEX = 1100;
export const TOOLTIP_Z_INDEX = 1100;

export function setZIndex(key: 'overlay' | 'modal' | 'tooltip', element: HTMLElement, base: number): void {
  ZIndexUtils.set(key, element, base);
}

export function clearZIndex(element: HTMLElement): void {
  ZIndexUtils.clear(element);
}

/** Pinta una plantilla directamente en <body> (para que ningún contenedor con overflow la corte). */
export function attachToBody<C>(container: ViewContainerRef, template: TemplateRef<C>, context?: C): EmbeddedViewRef<C> {
  const view = container.createEmbeddedView(template, context);
  view.detectChanges();
  for (const node of view.rootNodes as Node[]) {
    document.body.appendChild(node);
  }
  return view;
}

/**
 * Pone `overlay` (posición absoluta en la página) debajo de `target`, o encima si abajo no cabe; si se sale por la
 * derecha, lo alinea por la derecha del objetivo. Mismo cálculo que `absolutePosition` de PrimeNG, pero midiendo el
 * ancho natural de la capa (antes podía quedar unos px más angosta según dónde estuviera al medir).
 */
export function placeBelow(
  overlay: HTMLElement,
  target: HTMLElement,
  gutter: string | null = '2px',
  fixWidth = true,
): 'top' | 'bottom' {
  overlay.style.insetInlineStart = '0px';
  overlay.style.top = '0px';
  // Ancho con decimales: con offsetWidth (entero) un texto largo podía partirse en dos líneas.
  const width = overlay.getBoundingClientRect().width;
  const height = overlay.offsetHeight;
  const targetHeight = target.offsetHeight;
  const targetWidth = target.offsetWidth;
  const rect = target.getBoundingClientRect();
  const scrollTop = window.scrollY - (document.documentElement.clientTop || 0);
  const scrollLeft = window.scrollX - (document.documentElement.clientLeft || 0);
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  let top: number;
  let origin: 'top' | 'bottom' = 'top';
  if (rect.top + targetHeight + height > viewportHeight) {
    top = rect.top + scrollTop - height;
    origin = 'bottom';
    if (top < 0) {
      top = scrollTop;
    }
  } else {
    top = targetHeight + rect.top + scrollTop;
  }
  const left = rect.left + width > viewportWidth ? Math.max(0, rect.left + scrollLeft + targetWidth - width) : rect.left + scrollLeft;
  if (fixWidth) {
    overlay.style.width = `${width}px`;
  }
  overlay.style.insetInlineStart = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.transformOrigin = origin;
  if (gutter !== null) {
    overlay.style.marginTop = origin === 'bottom' ? `calc(${gutter} * -1)` : gutter;
  }
  return origin;
}

/** Contenedores con desplazamiento propio alrededor de `element` (al desplazarlos, la capa se cierra). */
export function scrollableParents(element: HTMLElement): HTMLElement[] {
  const parents: HTMLElement[] = [];
  let node = element.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX)) {
      parents.push(node);
    }
    node = node.parentElement;
  }
  return parents;
}
