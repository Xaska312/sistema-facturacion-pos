import { Component, computed, input, model } from '@angular/core';
import { SizeEntry } from '../../../core/api/api.models';

/**
 * Botones para elegir tallas de una escala (fase 8d). Las tallas de {@code locked} ya existen en el modelo: se ven
 * marcadas y no se pueden quitar.
 */
@Component({
  selector: 'app-size-picker',
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-1.5" role="group" [attr.aria-label]="label()">
        @for (size of sizes(); track size.label) {
          @let on = isOn(size.label);
          @let fixed = lockedSet().has(size.label);
          <button type="button"
                  class="min-w-11 px-2.5 py-1.5 rounded-md border text-sm font-medium transition-colors"
                  [class.bg-brand]="on" [class.text-brand-contrast]="on" [class.border-brand]="on"
                  [class.border-line]="!on" [class.opacity-60]="fixed"
                  [disabled]="fixed" [attr.aria-pressed]="on"
                  [title]="size.equivalent ? size.label + ' = ' + size.equivalent : size.label"
                  (click)="toggle(size.label)">
            {{ size.label }}
          </button>
        }
      </div>
      <div class="flex flex-wrap gap-3 text-xs">
        <button type="button" class="text-brand hover:underline" (click)="all()">Todas</button>
        <button type="button" class="text-brand hover:underline" (click)="none()">Ninguna</button>
        <span class="text-muted">{{ selected().length }} {{ selected().length === 1 ? 'talla elegida' : 'tallas elegidas' }}</span>
      </div>
    </div>
  `,
})
export class SizePickerComponent {
  readonly sizes = input.required<SizeEntry[]>();
  readonly locked = input<string[]>([]);
  readonly label = input('Tallas');
  /** Tallas nuevas elegidas, en el orden de la escala (sin las de {@code locked}). */
  readonly selected = model<string[]>([]);

  protected readonly lockedSet = computed(() => new Set(this.locked()));

  protected isOn(label: string): boolean {
    return this.lockedSet().has(label) || this.selected().includes(label);
  }

  protected toggle(label: string): void {
    const chosen = new Set(this.selected());
    if (chosen.has(label)) {
      chosen.delete(label);
    } else {
      chosen.add(label);
    }
    this.emit(chosen);
  }

  protected all(): void {
    this.emit(new Set(this.sizes().map((s) => s.label)));
  }

  protected none(): void {
    this.emit(new Set());
  }

  private emit(chosen: Set<string>): void {
    const locked = this.lockedSet();
    this.selected.set(this.sizes().map((s) => s.label).filter((l) => chosen.has(l) && !locked.has(l)));
  }
}
