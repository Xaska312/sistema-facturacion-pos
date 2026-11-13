import { Directive, ElementRef, OnDestroy, inject, input, numberAttribute } from '@angular/core';
import { TOOLTIP_Z_INDEX, clearZIndex, setZIndex } from './overlay';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Texto corto al pasar el mouse o llegar con el teclado (decisión 339; reemplaza a `pTooltip`): `[appTooltip]`,
 * `tooltipPosition` (top, bottom, left, right; por defecto right, como PrimeNG) y `showDelay`. Es solo visual: el nombre
 * accesible lo da el propio botón (texto o `aria-label`).
 */
@Directive({
  selector: '[appTooltip]',
  host: {
    '(mouseenter)': 'scheduleShow()',
    '(focus)': 'scheduleShow()',
    '(mouseleave)': 'hide()',
    '(blur)': 'hide()',
    '(click)': 'hide()',
    '(keydown.escape)': 'hide()',
  },
})
export class TooltipDirective implements OnDestroy {
  readonly appTooltip = input<string | null | undefined>(undefined);
  readonly tooltipPosition = input<TooltipPosition>('right');
  readonly showDelay = input(0, { transform: numberAttribute });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private element: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected scheduleShow(): void {
    clearTimeout(this.timer);
    if (!this.appTooltip()) {
      return;
    }
    const delay = this.showDelay();
    if (delay > 0) {
      this.timer = setTimeout(() => this.show(), delay);
    } else {
      this.show();
    }
  }

  hide(): void {
    clearTimeout(this.timer);
    if (this.element) {
      clearZIndex(this.element);
      this.element.remove();
      this.element = null;
    }
  }

  ngOnDestroy(): void {
    this.hide();
  }

  private show(): void {
    this.hide();
    const position = this.tooltipPosition();
    const tip = document.createElement('div');
    tip.className = `ui-tooltip ui-tooltip-${position}`;
    tip.setAttribute('role', 'tooltip');
    const arrow = document.createElement('div');
    arrow.className = 'ui-tooltip-arrow';
    const text = document.createElement('div');
    text.className = 'ui-tooltip-text';
    text.textContent = this.appTooltip() ?? '';
    tip.append(arrow, text);
    document.body.appendChild(tip);
    setZIndex('tooltip', tip, TOOLTIP_Z_INDEX);
    this.place(tip, arrow, position);
    this.element = tip;
  }

  /** Centrado contra el botón, del lado pedido; si se sale de la pantalla, se corre hacia adentro. */
  private place(tip: HTMLElement, arrow: HTMLElement, position: TooltipPosition): void {
    const host = this.host.nativeElement;
    const box = host.getBoundingClientRect();
    // Como PrimeNG: con el ancho y alto enteros del botón (offsetWidth/offsetHeight).
    const rect = { left: box.left, top: box.top, width: host.offsetWidth, height: host.offsetHeight,
      right: box.left + host.offsetWidth, bottom: box.top + host.offsetHeight };
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    let left: number;
    let top: number;
    if (position === 'top' || position === 'bottom') {
      left = rect.left + (rect.width - width) / 2;
      top = position === 'top' ? rect.top - height : rect.bottom;
    } else {
      top = rect.top + (rect.height - height) / 2;
      left = position === 'left' ? rect.left - width : rect.right;
    }
    const maxLeft = window.innerWidth - width;
    const clampedLeft = Math.max(0, Math.min(left, maxLeft));
    tip.style.left = `${clampedLeft + scrollX}px`;
    tip.style.top = `${top + scrollY}px`;
    if (position === 'top' || position === 'bottom') {
      arrow.style.left = `${rect.left + rect.width / 2 - clampedLeft}px`;
      arrow.style[position === 'top' ? 'bottom' : 'top'] = '0';
    } else {
      arrow.style.top = '50%';
      arrow.style[position === 'left' ? 'right' : 'left'] = '0';
    }
  }
}
