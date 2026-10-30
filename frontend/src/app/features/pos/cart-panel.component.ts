import { Component, DestroyRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Popover, PopoverModule } from 'primeng/popover';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { formatCop, formatQuantity } from '../../shared/money';
import { CartLine, CartTotals, lineAmounts, linePrice, modifierSummary, quantityForAmount, stepQuantity } from './sale-math';

export interface LineQuantityChange {
  key: string;
  quantity: number;
}

/** Precio libre (decisión 253): el precio unitario que escribió el cajero. */
export interface LinePriceChange {
  key: string;
  unitPrice: number;
}

/** Nota de la línea (Fase 12b-1); vacía = sin nota. */
export interface LineNoteChange {
  key: string;
  note: string;
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
  imports: [FormsModule, ButtonModule, PopoverModule, XIconComponent],
  template: `
    <aside aria-label="Venta actual" class="h-full flex flex-col gap-3 min-h-0">
      <div class="card flex-1 flex flex-col min-h-0 overflow-hidden">
        <div class="px-3 py-2 border-b flex items-center gap-2">
          <app-xicon name="customers" [size]="26" />
          <div class="flex-1 min-w-0">
            <p class="text-xs text-muted">Cliente</p>
            <p class="font-medium truncate">{{ customerName() }}</p>
          </div>
          <button type="button" class="pos-btn text-brand" [disabled]="disabled()" (click)="customer.emit()">Cambiar</button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto">
          @if (lines().length === 0) {
            <div class="h-full min-h-32 flex flex-col items-center justify-center gap-2 p-6 text-center text-muted">
              <app-xicon name="sell" [size]="44" />
              <p>Busca un producto, tócalo en la lista o escanéalo para empezar la venta.</p>
            </div>
          } @else {
            <ul class="divide-y" aria-label="Productos de la venta">
              @for (line of lines(); track line.key) {
                @let short = shortages().get(line.key);
                <li class="px-2 py-1.5 flex items-center gap-1" [class.bg-warning-soft]="short !== undefined">
                  <button type="button" class="flex-1 min-w-0 min-h-11 text-left px-1 rounded-lg hover:bg-surface-alt"
                          aria-haspopup="dialog" [attr.aria-label]="(line.openPrice ? 'Editar precio, cantidad y descuento: ' : 'Editar cantidad y descuento: ') + line.name"
                          (click)="openEditor($event, line)">
                    <span class="block font-medium leading-tight truncate">{{ line.name }}</span>
                    @if (line.modifiers?.length) {
                      <span class="block text-xs text-brand leading-tight">{{ extras(line) }}</span>
                    }
                    @if (line.note) {
                      <span class="block text-xs italic text-muted leading-tight truncate">“{{ line.note }}”</span>
                    }
                    <span class="block text-xs text-muted">
                      {{ q(line.quantity) }} {{ line.unitCode }} × {{ cop(price(line)) }}
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

      </div>

      <!-- Total y Cobrar en la baldosa de color, como la baldosa principal del inicio (identidad parte 3). -->
      <div class="total-tile">
        <div class="flex flex-col gap-0.5 text-sm">
          <p class="flex justify-between soft"><span>Artículos</span><span class="tabular-nums">{{ q(totals().items) }}</span></p>
          @if (totals().discount > 0) {
            <p class="flex justify-between soft"><span>Descuentos</span><span class="tabular-nums">−{{ cop(totals().discount) }}</span></p>
          }
          <p class="flex justify-between soft"><span>{{ pricesIncludeTax() ? 'Impuestos incluidos' : 'Impuestos' }}</span><span class="tabular-nums">{{ cop(totals().tax) }}</span></p>
        </div>
        <p class="flex justify-between items-baseline gap-2 mt-1">
          <span class="text-lg font-semibold">Total</span>
          <span class="text-4xl font-extrabold tracking-tight tabular-nums">{{ cop(totals().total) }}</span>
        </p>
        <div data-tour="charge" class="mt-2">
          <button type="button" class="charge-btn" aria-label="Cobrar (F4)" [disabled]="!canCharge()" (click)="charge.emit()">
            <app-xicon name="cash" [size]="28" />
            <span>Cobrar</span><span class="key" aria-hidden="true">F4</span>
          </button>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-x-2 mt-1">
          <button type="button" class="pos-btn on-brand" [disabled]="lines().length === 0" (click)="cancelSale.emit()">
            Cancelar venta (Esc)
          </button>
          <button type="button" class="pos-btn on-brand" [disabled]="lines().length === 0 || disabled()"
                  title="Guarda esta venta para atender a otro cliente y retomarla después" (click)="hold.emit()">
            <i class="pi pi-pause" aria-hidden="true"></i>Pausar venta
          </button>
          @if (lastSaleNumber(); as number) {
            <button type="button" class="pos-btn on-brand" (click)="reprint.emit()">
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
          @if (line.openPrice) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Precio por {{ line.unitCode }} ($)</span>
              <input id="edit-price" name="price" type="number" inputmode="numeric" min="0" step="any"
                     class="h-12 border rounded-lg px-3 text-lg text-right" [(ngModel)]="draftPrice" />
            </label>
          }
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Cantidad ({{ line.unitCode }})</span>
            <input id="edit-quantity" name="quantity" type="number" inputmode="decimal" min="0" step="any"
                   class="h-12 border rounded-lg px-3 text-lg text-right" [(ngModel)]="draftQuantity" />
          </label>
          @if (decimalUnits().has(line.unitId)) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">O vende por valor ($)</span>
              <input id="edit-amount" name="amount" type="number" inputmode="numeric" min="0" step="any"
                     class="h-12 border rounded-lg px-3 text-lg text-right" placeholder="Ej.: 5000"
                     [ngModel]="draftAmount" (ngModelChange)="setAmount(line, $event)" aria-describedby="amount-hint" />
              <span id="amount-hint" class="text-xs text-muted">Calcula la cantidad: $5.000 de queso → kg.</span>
            </label>
          }
          @if (notes()) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Nota</span>
              <input id="edit-note" name="note" class="h-12 border rounded-lg px-3" maxlength="140" autocomplete="off"
                     placeholder="Ej.: sin cebolla" [(ngModel)]="draftNote" />
            </label>
          }
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
    .total-tile {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 1.125rem 1.25rem 0.75rem;
      border-radius: 1.75rem;
      background: linear-gradient(160deg, var(--brand), var(--brand-hover));
      color: var(--brand-contrast);
      box-shadow: var(--elevation-card);
    }
    .soft {
      opacity: 0.85;
    }
    /* Cobrar: contraste invertido sobre la baldosa de color (texto de marca sobre el color de contraste). */
    .charge-btn {
      --xicon-fill: var(--brand);
      width: 100%;
      min-height: 4rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      border-radius: 1.25rem;
      background: var(--brand-contrast);
      color: var(--brand);
      font-size: 1.375rem;
      font-weight: 800;
      letter-spacing: -0.01em;
      transition: transform 0.1s, filter 0.15s;
    }
    .charge-btn:hover:not(:disabled) {
      filter: brightness(0.96);
    }
    .charge-btn:active:not(:disabled) {
      transform: scale(0.98);
    }
    .charge-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .charge-btn:focus-visible {
      outline: 3px solid var(--brand-contrast);
      outline-offset: 3px;
    }
    .key {
      margin-left: 0.375rem;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 700;
      background: var(--brand-soft);
      color: var(--brand-soft-text);
      vertical-align: middle;
    }
    .pos-btn.on-brand {
      color: var(--brand-contrast);
    }
    .pos-btn.on-brand:hover:not(:disabled) {
      background: color-mix(in srgb, var(--brand-contrast) 14%, transparent);
    }
    .pos-btn.on-brand:focus-visible {
      outline-color: var(--brand-contrast);
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

  /** Ids de las unidades con decimales: solo ahí se ofrece "vender por valor" (fase 8e). */
  readonly decimalUnits = input<ReadonlySet<string>>(new Set());
  /** Con Adiciones encendido (Fase 12b-1) cada línea puede llevar una nota ("sin cebolla"). */
  readonly notes = input(false);
  readonly noteChange = output<LineNoteChange>();
  readonly quantityChange = output<LineQuantityChange>();
  readonly discountChange = output<LineDiscountChange>();
  /** Precio libre: nuevo precio unitario de la línea. */
  readonly priceChange = output<LinePriceChange>();
  readonly removeLine = output<string>();
  readonly restoreLine = output<RemovedLine>();
  readonly charge = output<void>();
  readonly cancelSale = output<void>();
  /** "Pausar venta": guardarla en espera para atender a otro cliente. */
  readonly hold = output<void>();
  readonly customer = output<void>();
  readonly reprint = output<void>();

  private readonly editor = viewChild.required<Popover>('editor');
  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly editing = signal<CartLine | null>(null);
  protected readonly removed = signal<RemovedLine | null>(null);
  protected draftQuantity: number | null = null;
  protected draftDiscount: number | null = null;
  protected draftPrice: number | null = null;
  protected draftNote = '';
  /** "Vender por valor" (fase 8e): pesos escritos; la cantidad se calcula al vuelo. */
  protected draftAmount: number | null = null;
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearUndo());
  }

  protected readonly price = linePrice;
  protected readonly extras = modifierSummary;

  lineTotal(line: CartLine): number {
    return lineAmounts(linePrice(line), line.quantity, line.discountPercent, line.taxRate, this.pricesIncludeTax()).total;
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
    this.draftAmount = null;
    this.draftDiscount = line.discountPercent;
    this.draftPrice = line.openPrice ? line.unitPrice : null;
    this.draftNote = line.note ?? '';
    this.editor().show(event);
  }

  /** Con el descuento escrito en el editor, la cantidad que cobra ese valor. */
  protected setAmount(line: CartLine, value: number | null): void {
    this.draftAmount = value;
    const discount = Math.min(Math.max(Number(this.draftDiscount ?? 0) || 0, 0), this.maxDiscount());
    const quantity = value === null ? null
      : quantityForAmount(Number(value), linePrice(line), discount, line.taxRate, this.pricesIncludeTax());
    if (quantity !== null) {
      this.draftQuantity = quantity;
    }
  }

  focusEditor(): void {
    setTimeout(() => {
      // En una línea de precio libre, lo primero que se corrige es el precio.
      const input = (document.getElementById('edit-price') ?? document.getElementById('edit-quantity')) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 0);
  }

  applyEdit(): void {
    const line = this.editing();
    if (!line) {
      return;
    }
    const price = Number(this.draftPrice);
    if (line.openPrice && this.draftPrice !== null && Number.isFinite(price) && price > 0 && price !== line.unitPrice) {
      this.priceChange.emit({ key: line.key, unitPrice: Math.round(price * 100) / 100 });
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
    // Al final: la nota cambia la clave de la línea (puede unirse con otra igual).
    const note = this.draftNote.trim().slice(0, 140);
    if (this.notes() && note !== (line.note ?? '')) {
      this.noteChange.emit({ key: line.key, note });
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
