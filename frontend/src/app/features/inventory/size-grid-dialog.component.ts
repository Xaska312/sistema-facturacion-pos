import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, forkJoin, map, of } from 'rxjs';
import { Direction, InventoryDocumentType, ProductModel, ProductModelRow } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatQuantity } from '../../shared/money';
import { gridQuantities, modelGrid } from '../products/models/model-grid';
import { DraftLine, variantLine } from './document-lines';

/** Lo que devuelve la cuadrícula: las tallas del modelo y sus líneas (las vacías no vienen). */
export interface SizeGridResult {
  variantIds: string[];
  lines: DraftLine[];
}

/**
 * Cuadrícula talla × color para documentos de inventario (fase 8d): se busca el modelo y se escribe la cantidad de
 * cada talla y color de una vez (saldo inicial, ajuste, traslado o conteo). Muestra la existencia de cada talla en la
 * sucursal; en el conteo esa existencia es la que se compara.
 */
@Component({
  selector: 'app-size-grid-dialog',
  imports: [FormsModule, ButtonModule, InputTextModule, PesosInputDirective, FormDialogComponent],
  template: `
    <app-form-dialog [(visible)]="visible" width="64rem" header="Agregar por tallas"
                     [description]="selected() ? null : 'Busca el modelo (p. ej. «Tenis Runner») y escribe las cantidades por talla y color.'"
                     [dirty]="dirty()" [invalidMessage]="problem()" [save]="apply" submitLabel="Pasar a la lista"
                     submitIcon="pi pi-arrow-down" [successMessage]="null">
      <div class="flex flex-col gap-4">
        @if (selected(); as m) {
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-medium">{{ m.name }}</p>
              <p class="text-xs text-muted"><span class="font-mono">{{ m.skuPrefix }}</span> · {{ m.sizeScaleName }}</p>
            </div>
            <p-button label="Cambiar modelo" size="small" [text]="true" (onClick)="clear()" />
          </div>

          @if (type() === 'ADJUSTMENT' || type() === 'INITIAL') {
            <div class="flex flex-wrap gap-3">
              @if (type() === 'ADJUSTMENT') {
                <label class="flex flex-col gap-1">
                  <span class="text-sm font-medium">Tipo</span>
                  <select class="border rounded px-2 py-2" [(ngModel)]="direction">
                    <option value="IN">Entrada</option>
                    <option value="OUT">Salida</option>
                  </select>
                </label>
              }
              @if (type() === 'INITIAL' || direction === 'IN') {
                <label class="flex flex-col gap-1">
                  <span class="text-sm font-medium">Costo por unidad{{ type() === 'ADJUSTMENT' ? ' (opcional)' : '' }}</span>
                  <input pInputText appPesos="2" class="w-40" [(ngModel)]="unitCost"
                         [placeholder]="type() === 'ADJUSTMENT' ? 'Costo promedio' : ''" />
                </label>
              }
            </div>
          }

          <div class="overflow-x-auto">
            <table class="text-sm border-separate border-spacing-1">
              <caption class="sr-only">Cantidades de {{ m.name }} por color y talla</caption>
              <thead>
                <tr>
                  <th scope="col" class="text-left px-2 text-xs text-muted font-medium">{{ m.colors.length > 0 ? 'Color' : '' }}</th>
                  @for (size of grid().sizes; track size) {
                    <th scope="col" class="px-1 text-center font-medium">{{ size }}</th>
                  }
                  <th scope="col" class="px-2 text-right text-xs text-muted font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                @for (color of grid().colors; track color) {
                  <tr>
                    <th scope="row" class="text-left px-2 font-medium whitespace-nowrap">{{ color ?? 'Cantidad' }}</th>
                    @for (size of grid().sizes; track size) {
                      <td class="align-top">
                        @if (grid().at(color, size); as v) {
                          @if (v.active) {
                            <input pInputText type="number" min="0" step="1" inputmode="numeric"
                                   class="w-16 text-center px-1" [ngModel]="quantities()[v.productId]"
                                   (ngModelChange)="setQuantity(v.productId, $event)"
                                   [attr.aria-label]="(type() === 'COUNT' ? 'Contado ' : 'Cantidad ') + 'talla ' + size + (color ? ' ' + color : '')" />
                            @if (balances()[v.productId] !== undefined) {
                              <span class="block text-center text-xs text-muted" [title]="'Existencia en la sucursal: ' + q(balances()[v.productId])">
                                hay {{ q(balances()[v.productId]) }}
                              </span>
                            }
                          } @else {
                            <span class="block w-16 text-center text-muted text-xs py-2" title="Talla inactiva">inactiva</span>
                          }
                        } @else {
                          <span class="block w-16 text-center text-muted py-2" aria-label="No existe">—</span>
                        }
                      </td>
                    }
                    <td class="px-2 text-right align-top py-2 font-medium">{{ q(rowTotal(color)) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="text-sm" role="status">
            {{ filled() }} {{ filled() === 1 ? 'talla' : 'tallas' }} · {{ q(total()) }} {{ total() === 1 ? 'unidad' : 'unidades' }}.
            @if (type() === 'COUNT') {
              <span class="text-muted">Escribe 0 en las que contaste y no había; las vacías no se cuentan.</span>
            } @else {
              <span class="text-muted">Las casillas vacías no se agregan.</span>
            }
          </p>
        } @else {
          <div class="flex gap-2">
            <input pInputText class="flex-1" [(ngModel)]="search" placeholder="Nombre o prefijo del modelo"
                   autocomplete="off" (keydown.enter)="find($event)" aria-label="Buscar modelo" />
            <p-button label="Buscar" icon="pi pi-search" [outlined]="true" [loading]="searching()" (onClick)="find()" />
          </div>
          @if (results().length > 0) {
            <ul class="border rounded divide-y text-sm max-h-72 overflow-y-auto">
              @for (r of results(); track r.id) {
                <li>
                  <button type="button" class="w-full text-left px-3 py-2 hover:bg-surface-alt" (click)="choose(r)">
                    <span class="font-mono">{{ r.skuPrefix }}</span> {{ r.name }}
                    <span class="text-xs text-muted">· {{ r.variants }} {{ r.variants === 1 ? 'variante' : 'variantes' }}</span>
                  </button>
                </li>
              }
            </ul>
          } @else if (searched()) {
            <p class="text-sm text-muted">No hay modelos activos con «{{ lastSearch }}».</p>
          }
        }
      </div>
    </app-form-dialog>
  `,
})
export class SizeGridDialogComponent {
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);

  readonly visible = model(false);
  readonly type = input.required<InventoryDocumentType>();
  readonly branchId = input.required<string>();
  /** Líneas actuales del documento: las tallas que ya están aparecen con su cantidad. */
  readonly lines = input<DraftLine[]>([]);
  readonly applied = output<SizeGridResult>();

  protected readonly q = formatQuantity;
  protected readonly selected = signal<ProductModel | null>(null);
  protected readonly results = signal<ProductModelRow[]>([]);
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly quantities = signal<Record<string, number | null>>({});
  protected readonly balances = signal<Record<string, number | undefined>>({});
  protected readonly grid = computed(() => {
    const m = this.selected();
    return m ? modelGrid(m) : modelGrid({ ...EMPTY, variants: [] });
  });
  protected readonly entries = computed(() => {
    const m = this.selected();
    if (!m) {
      return [];
    }
    const active = { ...m, variants: m.variants.filter((v) => v.active) };
    return gridQuantities(active, this.quantities())
      .filter((e) => this.type() === 'COUNT' || e.quantity > 0);
  });
  protected readonly filled = computed(() => this.entries().length);
  protected readonly total = computed(() => this.entries().reduce((sum, e) => sum + e.quantity, 0));

  protected search = '';
  protected lastSearch = '';
  protected direction: Direction = 'IN';
  protected unitCost: number | null = null;
  /** Sucursal con la que se trajeron las existencias. */
  private balancesBranch = '';
  private initial = '';
  /** Último modelo elegido: una respuesta lenta de otro elegido antes se descarta. */
  private choosing = '';

  /** Abre el diálogo limpio (sin modelo elegido). */
  open(): void {
    this.clear();
    this.search = '';
    this.results.set([]);
    this.searched.set(false);
    this.visible.set(true);
  }

  protected dirty(): boolean {
    return this.selected() !== null && this.snapshot() !== this.initial;
  }

  /** Lo que el usuario puede cambiar: cantidades escritas, tipo y costo. */
  private snapshot(): string {
    const filled = Object.entries(this.quantities())
      .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
      .sort(([a], [b]) => a.localeCompare(b));
    const cost = this.unitCost === null || String(this.unitCost) === '' ? null : Number(this.unitCost);
    return JSON.stringify([filled, this.direction, cost]);
  }

  protected problem(): string | null {
    const m = this.selected();
    if (!m) {
      return 'Elige un modelo.';
    }
    if (this.type() === 'INITIAL' && this.entries().length > 0
      && (this.unitCost === null || String(this.unitCost) === '' || Number(this.unitCost) < 0)) {
      return 'Indica el costo por unidad.';
    }
    const bad = Object.values(this.quantities())
      .some((v) => v !== null && v !== undefined && String(v) !== '' && (Number.isNaN(Number(v)) || Number(v) < 0));
    if (bad) {
      return 'Revisa las cantidades: no pueden ser negativas.';
    }
    return null;
  }

  protected setQuantity(productId: string, value: number | null): void {
    this.quantities.update((all) => ({ ...all, [productId]: value }));
  }

  protected rowTotal(color: string | null): number {
    const key = (color ?? '').toLowerCase();
    return this.entries()
      .filter((e) => (e.variant.color ?? '').toLowerCase() === key)
      .reduce((sum, e) => sum + e.quantity, 0);
  }

  protected find(event?: Event): void {
    event?.preventDefault();
    const term = this.search.trim();
    if (!term) {
      return;
    }
    this.searching.set(true);
    this.lastSearch = term;
    this.catalog.productModels({ page: 0, size: 10, search: term }).subscribe({
      next: (page) => {
        this.searching.set(false);
        this.searched.set(true);
        const active = page.content.filter((m) => m.active);
        if (active.length === 1) {
          this.choose(active[0]);
        } else {
          this.results.set(active);
        }
      },
      error: () => this.searching.set(false),
    });
  }

  protected choose(row: ProductModelRow): void {
    this.results.set([]);
    this.choosing = row.id;
    this.catalog.productModel(row.id).subscribe((m) => {
      if (this.choosing !== row.id) {
        return;
      }
      const ids = new Set(m.variants.map((v) => v.productId));
      const existing = this.lines().filter((l) => ids.has(l.productId));
      const quantities: Record<string, number | null> = {};
      for (const line of existing) {
        quantities[line.productId] = line.quantity;
      }
      this.direction = existing[0]?.direction ?? 'IN';
      this.unitCost = existing.find((l) => l.unitCost !== null)?.unitCost
        ?? (this.type() === 'INITIAL' ? m.cost : null);
      this.quantities.set(quantities);
      this.initial = this.snapshot();
      this.selected.set(m);
      this.loadBalances(m);
    });
  }

  protected clear(): void {
    this.selected.set(null);
    this.quantities.set({});
    this.balances.set({});
    this.choosing = '';
    this.initial = '';
  }

  protected readonly apply = (): Observable<unknown> => {
    const m = this.selected();
    if (!m) {
      return of(null);
    }
    const type = this.type();
    const sameBranch = this.balancesBranch === this.branchId();
    const hasCost = this.unitCost !== null && String(this.unitCost) !== '';
    const lines = this.entries().map(({ variant, quantity }) => variantLine(variant, quantity, {
      direction: type === 'ADJUSTMENT' ? this.direction : 'IN',
      unitCost: (type === 'INITIAL' || (type === 'ADJUSTMENT' && this.direction === 'IN')) && hasCost
        ? Number(this.unitCost) : null,
      currentQuantity: type === 'COUNT' && sameBranch ? (this.balances()[variant.productId] ?? null) : null,
    }));
    // Solo las tallas activas: una línea de una talla desactivada después no se quita sin verla.
    this.applied.emit({ variantIds: m.variants.filter((v) => v.active).map((v) => v.productId), lines });
    return of(true);
  };

  private loadBalances(m: ProductModel): void {
    const branchId = this.branchId();
    const ids = m.variants.filter((v) => v.active).map((v) => v.productId);
    if (!branchId || ids.length === 0) {
      return;
    }
    // De a 100: con los ids en la URL, 400 tallas pasarían el límite de tamaño de la petición.
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += BALANCE_BATCH) {
      batches.push(ids.slice(i, i + BALANCE_BATCH));
    }
    forkJoin(batches.map((batch) => this.inventory.balances(branchId, batch)))
      .pipe(map((pages) => pages.flat()))
      .subscribe((rows) => {
        if (this.selected()?.id !== m.id) {
          return;
        }
        const byProduct: Record<string, number | undefined> = {};
        for (const row of rows) {
          byProduct[row.productId] = row.quantity;
        }
        this.balancesBranch = branchId;
        this.balances.set(byProduct);
      });
  }
}

const BALANCE_BATCH = 100;

const EMPTY: ProductModel = {
  id: '', skuPrefix: '', name: '', description: null, categoryId: null, categoryName: null, taxId: '', taxCode: null,
  cost: 0, salePrice: 0, sizeScaleId: '', sizeScaleName: '', active: true, sizes: [], colors: [], variants: [],
};
