import { Component, computed, input, output, signal } from '@angular/core';
import { Branch } from '../core/api/api.models';
import {
  MAX_RANGE_DAYS,
  PERIOD_OPTIONS,
  PeriodKey,
  PeriodSelection,
  daysBetween,
  isoDate,
} from '../features/reports/periods';

/**
 * Selector de periodo (Hoy, Ayer, 7 días…, Rango) y de sucursal para el tablero y los reportes.
 * No guarda estado propio: la pantalla lo lleva en la URL y lo pasa en {@code selection}.
 * Filtros adicionales (p. ej. vendedor) se proyectan con el atributo {@code periodExtra}.
 */
@Component({
  selector: 'app-period-filter',
  template: `
    <div class="card p-3 flex flex-wrap items-center gap-x-4 gap-y-3">
      @if (showPeriod()) {
      <div class="flex flex-wrap gap-1 p-1 rounded-lg bg-surface-alt" role="group" aria-label="Periodo">
        @for (option of visibleOptions(); track option.key) {
          <button type="button" class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors min-h-9"
                  [class.bg-surface]="selection().period === option.key"
                  [class.shadow-card]="selection().period === option.key"
                  [class.text-muted]="selection().period !== option.key"
                  [attr.aria-pressed]="selection().period === option.key" (click)="choose(option.key)">
            {{ option.label }}
          </button>
        }
      </div>
      }

      @if (showPeriod() && (selection().period === 'custom' || editingRange())) {
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <label class="flex items-center gap-2">
            <span>Desde</span>
            <input #fromInput type="date" class="border rounded-md px-2 py-1.5" [value]="draftFrom() || selection().from || ''" [max]="today"
                   (change)="draftFrom.set(fromInput.value); applyRange()" />
          </label>
          <label class="flex items-center gap-2">
            <span>Hasta</span>
            <input #toInput type="date" class="border rounded-md px-2 py-1.5" [value]="draftTo() || selection().to || ''" [max]="today"
                   (change)="draftTo.set(toInput.value); applyRange()" />
          </label>
          @if (rangeError()) {
            <span class="text-danger text-xs" role="alert">{{ rangeError() }}</span>
          }
        </div>
      }

      @if (showBranch()) {
        <label class="flex items-center gap-2 text-sm">
          <span class="text-muted">Sucursal</span>
          <select class="border rounded-md px-2 py-1.5" [value]="selection().branchId ?? ''" #branchSelect
                  (change)="setBranch(branchSelect.value)">
            <option value="">Todas</option>
            @for (b of branches(); track b.id) {
              <option [value]="b.id">{{ b.name }}</option>
            }
          </select>
        </label>
      }

      <ng-content select="[periodExtra]" />
    </div>
  `,
})
export class PeriodFilterComponent {
  readonly selection = input.required<PeriodSelection>();
  readonly options = input<readonly PeriodKey[]>(['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'custom']);
  readonly branches = input<readonly Branch[]>([]);
  readonly showBranch = input(true);
  /** false oculta el periodo (p. ej. el inventario valorizado es a hoy). */
  readonly showPeriod = input(true);
  readonly selectionChange = output<PeriodSelection>();

  protected readonly today = isoDate(new Date());
  protected readonly editingRange = signal(false);
  protected readonly draftFrom = signal('');
  protected readonly draftTo = signal('');
  protected readonly rangeError = signal<string | null>(null);
  protected readonly visibleOptions = computed(() => PERIOD_OPTIONS.filter((o) => this.options().includes(o.key)));

  protected choose(period: PeriodKey): void {
    this.rangeError.set(null);
    if (period === 'custom') {
      // Se emite cuando las dos fechas son válidas.
      const current = this.selection();
      this.draftFrom.set(current.from ?? this.today);
      this.draftTo.set(current.to ?? this.today);
      this.editingRange.set(true);
      return;
    }
    this.editingRange.set(false);
    this.selectionChange.emit({ ...this.selection(), period, from: null, to: null });
  }

  protected applyRange(): void {
    const from = this.draftFrom() || this.selection().from || '';
    const to = this.draftTo() || this.selection().to || '';
    const error = rangeProblem(from, to);
    this.rangeError.set(error);
    if (!error) {
      this.selectionChange.emit({ ...this.selection(), period: 'custom', from, to });
    }
  }

  protected setBranch(branchId: string): void {
    this.selectionChange.emit({ ...this.selection(), branchId: branchId || null });
  }
}

/** Problema del rango personalizado (null = válido). */
export function rangeProblem(from: string, to: string): string | null {
  if (!from || !to) {
    return 'Elige las dos fechas.';
  }
  const days = daysBetween(from, to).length;
  if (days === 0) {
    return 'La fecha final debe ser igual o posterior a la inicial.';
  }
  if (days > MAX_RANGE_DAYS - 1) {
    return 'El rango máximo es de un año.';
  }
  return null;
}
