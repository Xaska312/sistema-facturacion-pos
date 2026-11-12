import { Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CustomerWithholding, WithholdingType, WithholdingsApi } from '../../core/api/withholdings.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop } from '../../shared/money';
import {
  FINAL_CONSUMER_ID,
  NO_WITHHOLDING,
  TaxBases,
  WITHHOLDING_TYPES,
  WithholdingDraft,
  WithholdingResult,
  rateText,
  resolveForPayment,
  resolveForSale,
  typeLabel,
  usualText,
} from './withholding-text';

/**
 * "El cliente retuvo" (decisión 322): retefuente, reteICA o reteIVA de un cobro. Quien cobra aplica las retenciones de
 * la ficha del cliente, con su tarifa y la base que calcula XASKA; quien tiene el permiso de finanzas puede cambiar
 * tipo, tarifa, base y valor. El resultado (lo retenido y su detalle) sale por {@code result}.
 * <ul>
 *   <li>En una venta: {@code bases} son las de lo que se cobra.</li>
 *   <li>En un abono: {@code paid} es lo que paga el cliente y {@code basesOf} da las bases del abono completo.</li>
 * </ul>
 */
@Component({
  selector: 'app-withholding-box',
  imports: [FormsModule, ButtonModule, PesosInputDirective],
  template: `
    @if (eligible()) {
      <section class="border rounded-lg p-3 flex flex-col gap-2" aria-label="Retención del cliente">
        @if (!open()) {
          <button type="button" class="flex flex-wrap items-center gap-2 text-sm text-left min-h-9" (click)="start()">
            <i class="pi pi-percentage text-brand" aria-hidden="true"></i>
            <span class="font-medium text-brand">El cliente retuvo</span>
            @if (usual().length > 0) {
              <span class="text-xs text-muted">{{ usualLabel() }}</span>
            }
          </button>
        } @else {
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium">Retención del cliente</p>
            <button type="button" class="text-sm text-brand hover:underline" (click)="clear()">Quitar</button>
          </div>
          @for (d of drafts(); track d.type; let i = $index) {
            @let line = result().lines[i];
            <div class="flex flex-wrap items-end gap-2">
              @if (canManage()) {
                <label class="flex flex-col gap-1 w-32">
                  <span class="text-xs font-medium">Tipo</span>
                  <select class="h-10 border rounded-lg px-2 text-sm" [ngModel]="d.type" (ngModelChange)="patch(i, { type: $event, base: null, amount: null })">
                    @for (t of types; track t.type) {
                      <option [value]="t.type" [disabled]="t.type !== d.type && used(t.type)">{{ t.label }}</option>
                    }
                  </select>
                </label>
                <label class="flex flex-col gap-1 w-24">
                  <span class="text-xs font-medium">Tarifa %</span>
                  <input type="number" min="0" max="100" step="0.001" class="h-10 border rounded-lg px-2 text-right text-sm"
                         [ngModel]="d.rate" (ngModelChange)="patch(i, { rate: num($event), amount: null })" />
                </label>
                <label class="flex flex-col gap-1 w-32">
                  <span class="text-xs font-medium">Base</span>
                  <input appPesos class="h-10 border rounded-lg px-2 text-right tabular-nums text-sm" [ngModel]="line?.base"
                         (ngModelChange)="patch(i, { base: num($event), amount: null })" />
                </label>
                <label class="flex flex-col gap-1 w-32">
                  <span class="text-xs font-medium">Valor</span>
                  <input appPesos class="h-10 border rounded-lg px-2 text-right tabular-nums text-sm" [ngModel]="line?.amount"
                         (ngModelChange)="patch(i, { amount: num($event) })" />
                </label>
              } @else {
                <p class="flex-1 text-sm">{{ label(d.type) }} {{ rate(d.rate) }}
                  <span class="text-xs text-muted">de {{ cop(line?.base) }}</span></p>
                <span class="font-semibold tabular-nums">{{ cop(line?.amount) }}</span>
              }
              @if (drafts().length > 1) {
                <p-button icon="pi pi-times" severity="secondary" [text]="true" size="small"
                          [ariaLabel]="'Quitar ' + label(d.type)" (onClick)="remove(i)" />
              }
            </div>
          }
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            @if (canManage() && drafts().length < types.length) {
              <p-button label="Otra retención" icon="pi pi-plus" size="small" [text]="true" (onClick)="add()" />
            }
            <span class="ml-auto">Retiene <strong class="tabular-nums">{{ cop(result().total) }}</strong></span>
          </div>
        }
      </section>
    }
  `,
})
export class WithholdingBoxComponent {
  private readonly api = inject(WithholdingsApi);
  protected readonly canManage = permissionFlag('finance:manage');

  readonly customerId = input<string | null>(null);
  /** Venta: bases de lo que se cobra. */
  readonly bases = input<TaxBases | null>(null);
  /** Abono: lo que paga el cliente (la base sale del abono completo). */
  readonly paid = input<number | null>(null);
  readonly basesOf = input<((gross: number) => TaxBases) | null>(null);
  readonly result = model<WithholdingResult>(NO_WITHHOLDING);

  protected readonly types = WITHHOLDING_TYPES;
  protected readonly usual = signal<CustomerWithholding[]>([]);
  protected readonly open = signal(false);
  protected readonly drafts = signal<WithholdingDraft[]>([]);
  protected readonly cop = formatCop;
  protected readonly label = typeLabel;
  protected readonly rate = rateText;

  protected readonly eligible = computed(() => {
    const id = this.customerId();
    return !!id && id !== FINAL_CONSUMER_ID && (this.usual().length > 0 || this.canManage());
  });
  protected readonly usualLabel = computed(() => usualText(this.usual()));

  constructor() {
    // Otro cliente: se vuelven a pedir sus retenciones y se quita lo que había.
    effect(() => {
      const id = this.customerId();
      untracked(() => {
        this.reset();
        this.usual.set([]);
        if (id && id !== FINAL_CONSUMER_ID) {
          this.api.usual(id).subscribe({ next: (list) => this.usual.set(list), error: () => this.usual.set([]) });
        }
      });
    });
    effect(() => {
      const drafts = this.drafts();
      const basesOf = this.basesOf();
      const paid = this.paid();
      const bases = this.bases();
      const value = drafts.length === 0 ? NO_WITHHOLDING
        : basesOf && paid !== null ? resolveForPayment(drafts, Math.max(0, paid), basesOf)
          : resolveForSale(drafts, bases ?? { base: 0, iva: 0 });
      const next: WithholdingResult = value.lines.length === 0 ? NO_WITHHOLDING
        : { lines: value.lines, total: value.total };
      untracked(() => {
        // Solo avisa si cambió de verdad (el padre recalcula sus pagos con cada aviso).
        if (JSON.stringify(next) !== JSON.stringify(this.result())) {
          this.result.set(next);
        }
      });
    });
  }

  /** Sin retención (al abrir un cobro nuevo). */
  reset(): void {
    this.open.set(false);
    this.drafts.set([]);
  }

  protected start(): void {
    const usual = this.usual();
    this.drafts.set(usual.length > 0
      ? usual.map((u) => ({ type: u.type, rate: u.rate, base: null, amount: null }))
      : [{ type: 'RETEFUENTE', rate: null, base: null, amount: null }]);
    this.open.set(true);
  }

  protected clear(): void {
    this.reset();
  }

  protected used(type: WithholdingType): boolean {
    return this.drafts().some((d) => d.type === type);
  }

  protected add(): void {
    const next = this.types.find((t) => !this.used(t.type));
    if (next) {
      this.drafts.update((list) => [...list, { type: next.type, rate: null, base: null, amount: null }]);
    }
  }

  protected remove(index: number): void {
    this.drafts.update((list) => list.filter((_, i) => i !== index));
    if (this.drafts().length === 0) {
      this.reset();
    }
  }

  protected patch(index: number, change: Partial<WithholdingDraft>): void {
    this.drafts.update((list) => list.map((d, i) => (i === index ? { ...d, ...change } : d)));
  }

  protected num(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}
