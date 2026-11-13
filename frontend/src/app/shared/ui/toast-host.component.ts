import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ICON_CHECK, ICON_INFO_CIRCLE, ICON_TIMES, ICON_TIMES_CIRCLE, ICON_WARN } from './icons';
import { MODAL_Z_INDEX, clearZIndex, setZIndex } from './overlay';
import { ActiveToast, DEFAULT_TOAST_LIFE, ToastService } from './toast.service';

const ICONS: Record<string, string> = {
  success: ICON_CHECK,
  warn: ICON_WARN,
  error: ICON_TIMES_CIRCLE,
};

/**
 * Donde se pintan los avisos de `ToastService` (decisión 339; va una vez en `AppComponent` en lugar de `p-toast`).
 * Arriba a la derecha, encima de los diálogos; cada aviso se anuncia a los lectores de pantalla (`role="alert"`) y se
 * cierra solo al cumplir su tiempo, salvo mientras el mouse está encima.
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #box class="ui-toast" [class.ui-toast-empty]="toasts.messages().length === 0">
      @for (toast of toasts.messages(); track toast.id) {
        <div role="alert" aria-live="assertive" aria-atomic="true"
             [class]="'ui-toast-message ui-toast-message-' + severityOf(toast)"
             (mouseenter)="pause(toast)" (mouseleave)="resume(toast)">
          <div class="ui-toast-message-content">
            <svg class="ui-toast-message-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" [attr.d]="iconOf(toast)" />
            </svg>
            <div class="ui-toast-message-text">
              <div class="ui-toast-summary">{{ toast.summary }}</div>
              <div class="ui-toast-detail">{{ toast.detail }}</div>
            </div>
            @if (toast.closable !== false) {
              <div>
                <button type="button" class="ui-toast-close" aria-label="Cerrar" (click)="close(toast)">
                  <svg class="ui-toast-close-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path fill="currentColor" [attr.d]="closePath" />
                  </svg>
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
  protected readonly closePath = ICON_TIMES;
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private layered = false;

  constructor() {
    effect(() => {
      const messages = this.toasts.messages();
      for (const toast of messages) {
        if (!this.timers.has(toast.id)) {
          this.startTimer(toast);
        }
      }
      for (const id of [...this.timers.keys()]) {
        if (!messages.some((m) => m.id === id)) {
          clearTimeout(this.timers.get(id));
          this.timers.delete(id);
        }
      }
      this.layer(messages.length > 0);
    });
    inject(DestroyRef).onDestroy(() => {
      this.timers.forEach((timer) => clearTimeout(timer));
      this.layer(false);
    });
  }

  protected severityOf(toast: ActiveToast): string {
    return toast.severity ?? 'info';
  }

  protected iconOf(toast: ActiveToast): string {
    return ICONS[this.severityOf(toast)] ?? ICON_INFO_CIRCLE;
  }

  protected close(toast: ActiveToast): void {
    this.toasts.remove(toast.id);
  }

  protected pause(toast: ActiveToast): void {
    clearTimeout(this.timers.get(toast.id));
    this.timers.set(toast.id, undefined as unknown as ReturnType<typeof setTimeout>);
  }

  protected resume(toast: ActiveToast): void {
    this.startTimer(toast);
  }

  private startTimer(toast: ActiveToast): void {
    clearTimeout(this.timers.get(toast.id));
    if (toast.sticky) {
      this.timers.set(toast.id, undefined as unknown as ReturnType<typeof setTimeout>);
      return;
    }
    this.timers.set(
      toast.id,
      setTimeout(() => this.toasts.remove(toast.id), toast.life ?? DEFAULT_TOAST_LIFE),
    );
  }

  /** Encima de los diálogos abiertos, como hacía PrimeNG al mostrar el primer aviso. */
  private layer(visible: boolean): void {
    const box = this.box().nativeElement;
    if (visible && !this.layered) {
      setZIndex('modal', box, MODAL_Z_INDEX);
      this.layered = true;
    } else if (!visible && this.layered) {
      clearZIndex(box);
      this.layered = false;
    }
  }
}
