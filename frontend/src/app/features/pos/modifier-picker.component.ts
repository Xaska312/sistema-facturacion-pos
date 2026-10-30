import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { PosModifierGroup } from '../../core/api/modifiers.api';
import { formatCop } from '../../shared/money';
import { CartModifier, modifiersPerUnit } from './sale-math';
import {
  MAX_NOTE,
  ModifierPicks,
  chosenModifiers,
  decreaseOption,
  groupRule,
  missingGroup,
  tapOption,
} from './modifier-choice';

export interface ModifierPick {
  modifiers: CartModifier[];
  note: string;
}

/**
 * Selector de adiciones del POS (Fase 12b-1): cada grupo en baldosas táctiles (los obligatorios primero), las que se
 * repiten con − y ×N, y una nota libre al final. "Agregar" se habilita al completar lo obligatorio.
 */
@Component({
  selector: 'app-modifier-picker',
  imports: [FormsModule, ButtonModule],
  template: `
    <form class="flex flex-col gap-5" (ngSubmit)="confirm()">
      @for (g of groups(); track g.id) {
        <fieldset class="flex flex-col gap-2">
          <legend class="w-full flex items-baseline justify-between gap-2 mb-1">
            <span class="font-extrabold tracking-tight">{{ g.name }}</span>
            <span class="text-xs font-semibold" [class.text-danger]="g.minSelect > 0 && units(g) < g.minSelect"
                  [class.text-muted]="!(g.minSelect > 0 && units(g) < g.minSelect)">{{ rule(g) }}</span>
          </legend>
          <div class="grid gap-2 grid-cols-2 sm:grid-cols-3">
            @for (o of g.options; track o.id) {
              @let n = picks().get(o.id) ?? 0;
              <div class="relative">
                <button type="button" class="option" [attr.aria-pressed]="n > 0"
                        [attr.aria-label]="o.name + (o.priceDelta !== 0 ? ', ' + delta(o.priceDelta) : '') + (n > 1 ? ', ' + n + ' veces' : '')"
                        (click)="tap(g, o.id)">
                  <span class="font-semibold leading-tight">{{ o.name }}</span>
                  <span class="text-sm" [class.text-muted]="o.priceDelta === 0">{{ o.priceDelta === 0 ? 'Incluido' : delta(o.priceDelta) }}</span>
                  @if (n > 1) {
                    <span class="times" aria-hidden="true">×{{ n }}</span>
                  }
                </button>
                @if (n > 0 && o.maxQuantity > 1) {
                  <button type="button" class="less" [attr.aria-label]="'Una vez menos ' + o.name" (click)="less(o.id)">
                    <i class="pi pi-minus text-xs" aria-hidden="true"></i>
                  </button>
                }
              </div>
            }
          </div>
        </fieldset>
      }

      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold">Nota <span class="font-normal text-muted">(opcional)</span></span>
        <input name="note" class="h-12 border rounded-[10px] px-3" [maxlength]="maxNote" autocomplete="off"
               placeholder="Ej.: sin cebolla, poco hielo" [(ngModel)]="note" />
      </label>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs text-muted">Precio por unidad</p>
          <p class="text-2xl font-extrabold tracking-tight tabular-nums">{{ cop(total()) }}</p>
        </div>
        <div class="flex gap-2">
          <p-button label="Cancelar" [text]="true" severity="secondary" styleClass="min-h-12" (onClick)="cancelled.emit()" />
          <p-button type="submit" icon="pi pi-plus" styleClass="min-h-12 font-bold"
                    [label]="missing() ? 'Elige ' + missing()!.name : 'Agregar'" [disabled]="missing() !== null" />
        </div>
      </div>
    </form>
  `,
  styles: `
    .option {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.25rem;
      width: 100%;
      min-height: 4.25rem;
      padding: 0.625rem 0.75rem;
      border-radius: 1rem;
      border: 2px solid var(--surface-border);
      background: var(--surface);
      color: var(--text);
      text-align: left;
      transition: border-color 150ms, background-color 150ms, transform 100ms;
    }
    .option:hover { border-color: var(--brand); }
    .option:active { transform: scale(0.98); }
    .option[aria-pressed='true'] {
      border-color: var(--brand);
      background: var(--brand-soft);
      color: var(--brand-soft-text);
    }
    .option[aria-pressed='true'] .text-muted { color: var(--brand-soft-text); }
    .times {
      position: absolute;
      top: 0.5rem;
      right: 0.625rem;
      min-width: 1.75rem;
      padding: 0 0.375rem;
      border-radius: 9999px;
      background: var(--brand);
      color: var(--brand-contrast);
      font-size: 0.8125rem;
      font-weight: 800;
      text-align: center;
    }
    .less {
      position: absolute;
      bottom: 0.375rem;
      right: 0.375rem;
      width: 2.75rem;
      height: 2.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.75rem;
      background: var(--surface);
      border: 1px solid var(--surface-border);
      color: var(--text);
    }
  `,
})
export class ModifierPickerComponent {
  readonly groups = input.required<readonly PosModifierGroup[]>();
  /** Precio del producto sin adiciones. */
  readonly basePrice = input(0);
  readonly picked = output<ModifierPick>();
  readonly cancelled = output<void>();

  protected readonly cop = formatCop;
  protected readonly rule = groupRule;
  protected readonly maxNote = MAX_NOTE;
  protected readonly picks = signal<ModifierPicks>(new Map());
  protected note = '';

  protected readonly missing = computed(() => missingGroup(this.groups(), this.picks()));
  protected readonly total = computed(() =>
    Math.max(0, this.basePrice() + modifiersPerUnit({ modifiers: chosenModifiers(this.groups(), this.picks()) })));

  constructor() {
    // Producto nuevo: se empieza de cero (el diálogo se reutiliza).
    effect(() => {
      this.groups();
      this.picks.set(new Map());
      this.note = '';
    });
  }

  protected units(group: PosModifierGroup): number {
    return group.options.reduce((sum, o) => sum + (this.picks().get(o.id) ?? 0), 0);
  }

  protected delta(value: number): string {
    return (value > 0 ? '+ ' : '− ') + formatCop(Math.abs(value));
  }

  protected tap(group: PosModifierGroup, optionId: string): void {
    this.picks.set(tapOption(group, this.picks(), optionId));
  }

  protected less(optionId: string): void {
    this.picks.set(decreaseOption(this.picks(), optionId));
  }

  protected confirm(): void {
    if (this.missing()) {
      return;
    }
    this.picked.emit({ modifiers: chosenModifiers(this.groups(), this.picks()), note: this.note.trim().slice(0, MAX_NOTE) });
  }
}
