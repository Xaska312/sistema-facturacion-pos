import { Component, DestroyRef, ElementRef, HostListener, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { TourService } from './tour.service';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 6;
const CARD_WIDTH = 320;
const GAP = 12;

/**
 * Capa del recorrido guiado (una sola, en la raíz de la app): oscurece la pantalla, resalta el elemento del paso y
 * muestra una tarjeta con Atrás / Siguiente / Saltar. Esc lo cierra sin que la tecla llegue a la pantalla de abajo
 * (en el POS, Esc cancela la venta). Al terminar devuelve el foco a donde estaba.
 */
@Component({
  selector: 'app-tour-overlay',
  template: `
    @if (tour.active(); as active) {
      @let step = tour.step()!;
      <div class="tour-layer" (click)="$event.stopPropagation()">
        @if (box(); as b) {
          <div class="tour-spot" aria-hidden="true"
               [style.top.px]="b.top" [style.left.px]="b.left" [style.width.px]="b.width" [style.height.px]="b.height"></div>
        } @else {
          <div class="tour-dim" aria-hidden="true"></div>
        }
        <section #card class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title"
                 aria-describedby="tour-text" [style.top.px]="cardTop()" [style.left.px]="cardLeft()">
          <p class="text-xs font-medium text-muted">Paso {{ active.index + 1 }} de {{ active.tour.steps.length }}</p>
          <h2 id="tour-title" class="text-base font-semibold mt-1">{{ step.title }}</h2>
          <p id="tour-text" class="text-sm text-muted mt-1">{{ step.text }}</p>
          <div class="flex items-center gap-2 mt-4">
            <button type="button" class="tour-link" (click)="tour.finish()">Saltar</button>
            <span class="flex-1"></span>
            @if (active.index > 0) {
              <button type="button" class="tour-button tour-button--secondary" (click)="tour.previous()">Atrás</button>
            }
            <button #nextButton type="button" class="tour-button" (click)="tour.next()">
              {{ active.index + 1 === active.tour.steps.length ? 'Terminar' : 'Siguiente' }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
  styles: `
    .tour-layer {
      position: fixed;
      inset: 0;
      z-index: 3000;
    }
    .tour-dim {
      position: absolute;
      inset: 0;
      background: var(--backdrop);
    }
    .tour-spot {
      position: absolute;
      border-radius: 0.75rem;
      box-shadow: 0 0 0 9999px var(--backdrop);
      outline: 2px solid var(--brand);
      transition: top 200ms ease-out, left 200ms ease-out, width 200ms ease-out, height 200ms ease-out;
      pointer-events: none;
    }
    .tour-card {
      position: absolute;
      width: min(20rem, calc(100vw - 2rem));
      padding: 1rem;
      border-radius: 0.75rem;
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--surface-border);
      box-shadow: var(--elevation-overlay);
    }
    .tour-button {
      min-height: 2.75rem;
      padding: 0 1rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
      background: var(--brand);
      color: var(--brand-contrast);
    }
    .tour-button--secondary {
      background: var(--surface-alt);
      color: var(--text);
    }
    .tour-link {
      min-height: 2.75rem;
      padding: 0 0.5rem;
      font-size: 0.875rem;
      color: var(--text-muted);
      text-decoration: underline;
    }
  `,
})
export class TourOverlayComponent {
  protected readonly tour = inject(TourService);
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly nextButton = viewChild<ElementRef<HTMLButtonElement>>('nextButton');

  protected readonly box = signal<Box | null>(null);
  protected readonly cardTop = signal(0);
  protected readonly cardLeft = signal(0);
  private returnFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const step = this.tour.step();
      untracked(() => {
        if (step) {
          if (!this.returnFocus && document.activeElement instanceof HTMLElement) {
            this.returnFocus = document.activeElement;
          }
          setTimeout(() => this.place(true), 0);
        } else if (this.returnFocus) {
          const target = this.returnFocus;
          this.returnFocus = null;
          setTimeout(() => target.focus(), 0);
        }
      });
    });
    const reposition = () => this.place(false);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    });
  }

  /**
   * Esc cierra el recorrido y Tab no sale de la tarjeta. Ninguna tecla sigue a la pantalla de abajo mientras se ve
   * el recorrido (en el POS, Esc cancelaría la venta y F4 abriría el cobro); los botones de la tarjeta funcionan igual.
   */
  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (!this.tour.active()) {
      return;
    }
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.tour.finish();
    } else if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  private place(scroll: boolean): void {
    const step = this.tour.step();
    if (!step) {
      return;
    }
    const target = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    if (target && scroll) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
    const rect = target ? visibleBox(target) : null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardHeight = this.card()?.nativeElement.offsetHeight ?? 180;
    const cardWidth = Math.min(CARD_WIDTH, viewportWidth - 32);

    if (!rect || rect.width === 0) {
      this.box.set(null);
      this.cardTop.set(Math.max(16, (viewportHeight - cardHeight) / 2));
      this.cardLeft.set(Math.max(16, (viewportWidth - cardWidth) / 2));
    } else {
      this.box.set({
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      });
      const below = rect.bottom + PADDING + GAP;
      const above = rect.top - PADDING - GAP - cardHeight;
      const top = below + cardHeight <= viewportHeight - 16 ? below : above >= 16 ? above
        : Math.max(16, viewportHeight - cardHeight - 16);
      this.cardTop.set(top);
      this.cardLeft.set(Math.min(Math.max(16, rect.left), viewportWidth - cardWidth - 16));
    }
    if (scroll) {
      this.nextButton()?.nativeElement.focus();
    }
  }

  private trapTab(event: KeyboardEvent): void {
    const card = this.card()?.nativeElement;
    if (!card) {
      return;
    }
    const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button'));
    if (buttons.length === 0) {
      return;
    }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !card.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !card.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
}

/**
 * Caja visible de un elemento. Un componente sin estilo de host es "inline" y su caja puede medir 0; en ese caso se
 * usa la unión de sus hijos.
 */
function visibleBox(element: HTMLElement): DOMRect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return rect;
  }
  const children = Array.from(element.children).map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (children.length === 0) {
    return null;
  }
  const top = Math.min(...children.map((r) => r.top));
  const left = Math.min(...children.map((r) => r.left));
  const right = Math.max(...children.map((r) => r.right));
  const bottom = Math.max(...children.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}
