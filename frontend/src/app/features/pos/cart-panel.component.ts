import { Component, DestroyRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Popover, PopoverModule } from 'primeng/popover';
import { formatCop, formatQuantity } from '../../shared/money';
import { CartLine, CartTotals, lineAmounts, stepQuantity } from './sale-math';

export interface LineQuantityChange {
  key: string;
  quantity: number;
}

export interface LineDiscountChange {
  key: string;
  discountPercent: number;
}

export interface RemovedLine {
  line: CartLine;
  index: number;
}

const UNDO_MS = 6000;

/**
 * Carrito táctil del POS: filas altas con − / + / quitar (≥ 44 px), edición de cantidad y descuento en un popover
 * al tocar la fila, aviso de existencia insuficiente, "Deshacer" al quitar una línea, totales y el botón Cobrar.
 * No cambia el carrito: emite cada cambio y el POS lo aplica (así la clave de idempotencia se invalida en un
 * solo lugar).
 */
@Component({
  selector: 'app-cart-panel',
  imports: [FormsModule, ButtonModule, PopoverModule],
  template: `
    <aside aria-label="Venta actual" class="card h-full flex flex-col min-h-0">
      <div class="px-3 py-2 border-b flex items-center gap-2">
        <i class="pi pi-user text-muted" aria-hidden="true"></i>
        <div class="flex-1 min-w-0">
          <p class="text-xs text-muted">Cliente</p>
          <p class="font-medium truncate">{{ customerName() }}</p>
        </div>
        <button type="button" class="pos-btn text-brand" [disabled]="disabled()" (click)="customer.emit()">Cambiar</button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto">
        @if (lines().length === 0) {
          <div class="h-full min-h-32 flex flex-col items-center justify-center gap-2 p-6 text-center text-muted">
            <i class="pi pi-barcode text-3xl" aria-hidden="true"></i>
            <p>Escanea un producto o tócalo en la lista para empezar la venta.</p>
          </div>
        } @else {
          <ul class="divide-y" aria-label="Productos de la venta">
            @for (line of lines(); track line.key) {
              @let short = shortages().get(line.key);
              <li class="px-2 py-1.5 flex items-center gap-1" [class.bg-warning-soft]="short !== undefined">
                <button type="button" class="flex-1 min-w-0 min-h-11 text-left px-1 rounded-lg hover:bg-surface-alt"
                        aria-haspopup="dialog" [attr.aria-label]="'Editar cantidad y descuento: ' + line.name"
                        (click)="openEditor($event, line)">
                  <span class="block font-medium leading-tight truncate">{{ line.name }}</span>
                  <span class="block text-xs text-muted">
                    {{ q(line.quantity) }} {{ line.unitCode }} × {{ cop(line.unitPrice) }}
                    @if (line.discountPercent > 0) {
                      <span class="text-success"> · −{{ q(line.discountPercent) }} %</span>
                    }
                  </span>
                  @if (short !== undefined) {
                    <span class="flex items-center gap-1 text-xs font-medium text-warning-soft-fg">
                      <i class="pi pi-exclamation-triangle text-xs" aria-hidden="true"></i>
                      {{ short > 0 ? 'Solo hay ' + q(short) + ' en existencia' : 'Agotado en esta sucursal' }}
                    </span>
                  }
                </button>
                <span class="w-20 text-right font-semibold whitespace-nowrap">{{ cop(lineTotal(line)) }}</span>
                <div class="flex items-center" role="group" [attr.aria-label]="'Cantidad de ' + line.name">
                  <button type="button" class="qty-btn" [attr.aria-label]="'Uno menos de ' + line.name"
                          [disabled]="disabled()" (click)="step(line, -1)">
                    <i class="pi pi-minus" aria-hidden="true"></i>
                  </button>
                  <span class="min-w-8 text-center font-medium tabular-nums" aria-live="polite">{{ q(line.quantity) }}</span>
                  <button type="button" class="qty-btn" [attr.aria-label]="'Uno más de ' + line.name"
                          [disabled]="disabled()" (click)="step(line, 1)">
                    <i class="pi pi-plus" aria-hidden="true"></i>
                  </button>
                </div>
                <button type="button" class="qty-btn text-danger" [attr.aria-label]="'Quitar ' + line.name"
                        [disabled]="disabled()" (click)="remove(line)">
                  <i class="pi pi-trash" aria-hidden="true"></i>
                </button>
              </li>
            }
          </ul>
        }
      </div>

      @if (removed(); as r) {
        <div role="status" class="mx-2 mb-2 px-3 py-1 rounded-lg bg-fg text-surface flex items-center gap-2 text-sm">
          <span class="flex-1 truncate">Se quitó {{ r.line.name }}</span>
          <button type="button" class="pos-btn font-semibold underline" (click)="undo()">Deshacer</button>
        </div>
      }

      <div class="border-t p-3 flex flex-col gap-1 text-sm">
        <p class="flex justify-between text-muted"><span>Artículos</span><span>{{ q(totals().items) }}</span></p>
        @if (totals().discount > 0) {
          <p class="flex justify-between text-success"><span>Descuentos</span><span>−{{ cop(totals().discount) }}</span></p>
        }
        <p class="flex justify-between text-muted"><span>{{ pricesIncludeTax() ? 'Impuestos incluidos' : 'Impuestos' }}</span><span>{{ cop(totals().tax) }}</span></p>
        <p class="flex justify-between items-baseline text-3xl font-semibold mt-1">
          <span class="text-lg">Total</span><span>{{ cop(totals().total) }}</span>
        </p>
        <div data-tour="charge" class="mt-2">
          <p-button styleClass="w-full min-h-14 text-xl font-semibold" size="large" icon="pi pi-wallet"
                    label="Cobrar (F4)" [disabled]="!canCharge()" (onClick)="charge.emit()" />
        </div>
        <div class="flex items-center justify-between gap-2">
          <button type="button" class="pos-btn text-muted" [disabled]="lines().length === 0" (click)="cancelSale.emit()">
            Cancelar venta (Esc)
          </button>
          @if (lastSaleNumber(); as number) {
            <button type="button" class="pos-btn text-brand" (click)="reprint.emit()">
              <i class="pi pi-print" aria-hidden="true"></i>Reimprimir {{ number }}
            </button>
          }
        </div>
      </div>
    </aside>

    <p-popover #editor ariaLabel="Editar línea" (onShow)="focusEditor()" (onHide)="editorClosed()">
      @if (editing(); as line) {
        <form class="flex flex-col gap-3 w-64" (ngSubmit)="applyEdit()">
          <p class="font-medium leading-tight">{{ line.name }}</p>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Cantidad ({{ line.unitCode }})</span>
            <input id="edit-quantity" name="quantity" type="number" inputmode="decimal" min="0" step="any"
                   class="h-12 border rounded-lg px-3 text-lg text-right" [(ngModel)]="draftQuantity" />
          </label>
          <div class="flex flex-col gap-1">
            <label for="edit-discount" class="text-sm font-medium">Descuento %</label>
            <input id="edit-discount" name="discount" type="number" inputmode="decimal" min="0" [max]="maxDiscount()"
                   step="any" class="h-12 border rounded-lg px-3 text-lg text-right" [disabled]="maxDiscount() === 0"
                   [(ngModel)]="draftDiscount" aria-describedby="discount-hint" />
            <span id="discount-hint" class="text-xs text-muted">
              {{ maxDiscount() === 0 ? 'Tu usuario no puede dar descuentos.' : 'Máximo ' + q(maxDiscount()) + ' %.' }}
            </span>
          </div>
          <div class="flex justify-end gap-2">
            <p-button label="Cancelar" [text]="true" severity="secondary" styleClass="min-h-11" (onClick)="closeEditor()" />
            <p-button type="submit" label="Aplicar" styleClass="min-h-11" />
          </div>
        </form>
      }
    </p-popover>
  `,
  styles: `
    :host {
      display: block;
      min-height: 0;
    }
    .qty-btn {
      width: 2.75rem;
      height: 2.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: 0.5rem;
    }
    .qty-btn:hover:not(:disabled),
    .pos-btn:hover:not(:disabled) {
      background: var(--surface-alt);
    }
    .pos-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 2.75rem;
      padding: 0 0.625rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }
    .qty-btn:disabled,
    .pos-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
})
export class CartPanelComponent {
  readonly lines = input<readonly CartLine[]>([]);
  readonly totals = input.required<CartTotals>();
  readonly pricesIncludeTax = input(true);
  /** Por clave de línea, cuánto hay en existencia cuando no alcanza (ver stockShortages). */
  readonly shortages = input<ReadonlyMap<string, number>>(new Map());
  readonly maxDiscount = input(0);
  readonly customerName = input('');
  readonly canCharge = input(false);
  readonly disabled = input(false);
  readonly lastSaleNumber = input<string | null>(null);

  readonly quantityChange = output<LineQuantityChange>();
  readonly discountChange = output<LineDiscountChange>();
  readonly removeLine = output<string>();
  readonly restoreLine = output<RemovedLine>();
  readonly charge = output<void>();
  readonly cancelSale = output<void>();
  readonly customer = output<void>();
  readonly reprint = output<void>();

  private readonly editor = viewChild.required<Popover>('editor');
  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly editing = signal<CartLine | null>(null);
  protected readonly removed = signal<RemovedLine | null>(null);
  protected draftQuantity: number | null = null;
  protected draftDiscount: number | null = null;
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearUndo());
  }

  lineTotal(line: CartLine): number {
    return lineAmounts(line.unitPrice, line.quantity, line.discountPercent, line.taxRate, this.pricesIncludeTax()).total;
  }

  step(line: CartLine, delta: number): void {
    const quantity = stepQuantity(line.quantity, delta);
    if (quantity === 0) {
      this.remove(line);
    } else {
      this.quantityChange.emit({ key: line.key, quantity });
    }
  }

  remove(line: CartLine): void {
    const index = this.lines().findIndex((l) => l.key === line.key);
    if (index < 0) {
      return;
    }
    this.clearUndo();
    this.removed.set({ line, index });
    this.undoTimer = setTimeout(() => this.removed.set(null), UNDO_MS);
    this.removeLine.emit(line.key);
  }

  undo(): void {
    const removed = this.removed();
    this.clearUndo();
    if (removed) {
      this.restoreLine.emit(removed);
    }
  }

  /** Oculta "Deshacer" (p. ej. al terminar o cancelar la venta). */
  clearUndo(): void {
    if (this.undoTimer !== null) {
      clearTimeout(this.undoTimer);
      this.undoTimer = null;
    }
    this.removed.set(null);
  }

  openEditor(event: Event, line: CartLine): void {
    this.editing.set(line);
    this.draftQuantity = line.quantity;
    this.draftDiscount = line.discountPercent;
    this.editor().show(event);
  }

  focusEditor(): void {
    setTimeout(() => {
      const input = document.getElementById('edit-quantity') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 0);
  }

  applyEdit(): void {
    const line = this.editing();
    if (!line) {
      return;
    }
    const quantity = Number(this.draftQuantity);
    if (this.draftQuantity !== null && Number.isFinite(quantity) && quantity >= 0) {
      if (quantity === 0) {
        this.closeEditor();
        this.remove(line);
        return;
      }
      if (quantity !== line.quantity) {
        this.quantityChange.emit({ key: line.key, quantity });
      }
    }
    const rawDiscount = Number(this.draftDiscount ?? 0);
    const discountPercent = Math.min(Math.max(Number.isFinite(rawDiscount) ? rawDiscount : 0, 0), this.maxDiscount());
    if (discountPercent !== line.discountPercent) {
      this.discountChange.emit({ key: line.key, discountPercent });
    }
    this.closeEditor();
  }

  /** Cierra el editor si estaba abierto; devuelve si lo estaba (para que Esc no cancele la venta). */
  closeEditor(): boolean {
    const wasOpen = this.editing() !== null;
    if (wasOpen) {
      this.editor().hide();
    }
    return wasOpen;
  }

  /** Se limpia después del evento actual: así el Esc que cerró el popover no llega a cancelar la venta. */
  editorClosed(): void {
    setTimeout(() => this.editing.set(null), 0);
  }
}
