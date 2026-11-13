import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ButtonComponent } from '../../shared/ui/button.component';
import { Category, SizeScale, Tax, Unit } from '../../core/api/api.models';
import { CatalogApi, InvoiceCreatedLine } from '../../core/api/catalog.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { InvoiceDraftLine } from '../../core/api/purchases.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { formatCop } from '../../shared/money';
import { marginOf } from '../products/catalog-text';
import { NewProductRow, rowProblem, sizesNotice, sizesTotal, toItems, toRows } from './invoice-new-products';

/**
 * Crear los que faltan (decisión 301): las líneas de la factura que no están en XASKA se revisan en una tabla y se
 * crean todas de una vez, simples o con tallas; al guardar quedan en la recepción con lo que llegó.
 */
@Component({
  selector: 'app-invoice-new-products',
  imports: [FormsModule, ButtonComponent],
  template: `
    <section class="new-products flex flex-col gap-3" aria-labelledby="new-products-title">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex-1 min-w-56">
          <h3 id="new-products-title" class="font-bold tracking-tight">Crear los que faltan</h3>
          <p class="text-xs text-muted">Revisa nombre, SKU y precio. Al guardar se crean y quedan abajo con lo que
            llegó. Nada se crea hasta que toques "Crear".</p>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <span class="text-muted">Margen</span>
          <input type="number" min="0" max="90" class="field w-20 text-right" [(ngModel)]="margin"
                 (change)="reprice()" aria-label="Margen para el precio de venta" />
          <span class="text-muted">%</span>
        </label>
      </div>

      @if (loading()) {
        <p class="text-sm text-muted" role="status">Preparando…</p>
      } @else {
        @for (r of rows(); track r.lineNo) {
          <article class="row-card" [class.opacity-60]="!r.selected" [attr.aria-label]="r.description">
            <div class="flex flex-wrap items-start gap-3">
              <input type="checkbox" class="mt-3" [(ngModel)]="r.selected" (ngModelChange)="touch()"
                     [attr.aria-label]="'Crear ' + r.description" />
              <div class="flex-1 min-w-60 grid gap-2 sm:grid-cols-6">
                <label class="sm:col-span-3 text-xs text-muted">Nombre
                  <input class="field w-full text-sm" [(ngModel)]="r.name" (ngModelChange)="touch()" maxlength="200" />
                </label>
                <label class="sm:col-span-1 text-xs text-muted">{{ r.withSizes ? 'Prefijo' : 'SKU' }}
                  <input class="field w-full font-mono text-sm" [(ngModel)]="r.sku" (ngModelChange)="touch()" maxlength="40" />
                </label>
                <label class="sm:col-span-2 text-xs text-muted">Categoría
                  <input class="field w-full text-sm" [(ngModel)]="r.category" list="new-products-categories" maxlength="60" />
                </label>
                @if (!r.withSizes) {
                  <label class="sm:col-span-1 text-xs text-muted">Unidad
                    <select class="field w-full text-sm" [(ngModel)]="r.unitCode">
                      @for (u of units(); track u.id) { <option [value]="u.code">{{ u.code }}</option> }
                    </select>
                  </label>
                }
                <label class="sm:col-span-2 text-xs text-muted">Impuesto
                  <select class="field w-full text-sm" [(ngModel)]="r.taxCode" (ngModelChange)="touch()">
                    @for (t of taxes(); track t.id) { <option [value]="t.code">{{ t.name }}</option> }
                  </select>
                </label>
                <label class="sm:col-span-1 text-xs text-muted">Costo
                  <input type="number" min="0" class="field w-full text-right text-sm" [(ngModel)]="r.cost" (ngModelChange)="touch()" />
                </label>
                <label class="sm:col-span-1 text-xs text-muted">Precio
                  <input type="number" min="0" step="100" class="field w-full text-right text-sm font-semibold"
                         [(ngModel)]="r.price" (ngModelChange)="touch()" />
                </label>
                <p class="sm:col-span-1 text-xs text-muted self-end pb-2">Margen {{ marginText(r) }}</p>
              </div>
            </div>

            <p class="text-xs text-muted mt-2">Factura: {{ r.description }} · {{ r.quantity }}
              @if (r.supplierCode) { · {{ r.supplierCode }} }</p>

            @if (variants()) {
              <label class="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" [(ngModel)]="r.withSizes" (ngModelChange)="touch()" />
                Tiene tallas
              </label>
              @if (r.withSizes) {
                <div class="sizes mt-2 flex flex-col gap-2">
                  <div class="flex flex-wrap gap-2">
                    <label class="text-xs text-muted">Escala
                      <select class="field text-sm" [(ngModel)]="r.sizeScaleId" (ngModelChange)="touch()">
                        @for (s of scales(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
                      </select>
                    </label>
                    <label class="text-xs text-muted">Color (opcional)
                      <input class="field text-sm w-36" [(ngModel)]="r.color" maxlength="40" />
                    </label>
                  </div>
                  <div class="flex flex-wrap gap-1.5" role="group" [attr.aria-label]="'Pares por talla de ' + r.name">
                    @for (s of sizesOf(r); track s) {
                      <label class="size-cell" [class.size-on]="(r.sizeQty[s.toUpperCase()] || 0) > 0">
                        <span class="text-xs font-semibold">{{ s }}</span>
                        <input type="number" min="0" class="size-input" [ngModel]="r.sizeQty[s.toUpperCase()] || null"
                               (ngModelChange)="setSize(r, s, $event)" [attr.aria-label]="'Talla ' + s" />
                      </label>
                    }
                  </div>
                  <p class="text-xs" [class.text-warning]="notice(r) !== null" [class.text-muted]="notice(r) === null">
                    {{ notice(r) ?? ('Repartidos: ' + total(r) + ' de ' + r.quantity) }}</p>
                </div>
              }
            }
            @if (problemOf(r); as p) {
              <p class="text-xs text-danger mt-1">{{ p }}</p>
            }
          </article>
        }
        <datalist id="new-products-categories">
          @for (c of categories(); track c.id) { <option [value]="c.name"></option> }
        </datalist>

        <div class="flex flex-wrap items-center gap-2">
          <p class="text-sm flex-1 min-w-48">
            @if (problems() > 0) {
              <span class="text-danger">{{ problems() }} por corregir.</span>
            } @else {
              Se van a crear <strong>{{ selectedCount() }}</strong> {{ selectedCount() === 1 ? 'producto' : 'productos' }}.
            }
          </p>
          <app-button label="Cancelar" [text]="true" (clicked)="closed.emit()" />
          <app-button [label]="'Crear ' + selectedCount()" icon="pi pi-check" severity="success" [loading]="saving()"
                    [disabled]="selectedCount() === 0 || problems() > 0" (clicked)="save()" />
        </div>
      }
    </section>
  `,
  styles: `
    .new-products { padding: 0.875rem; border-radius: 0.875rem; border: 1px solid var(--aska-line); background: var(--aska-soft); }
    .row-card { padding: 0.75rem; border-radius: 0.75rem; background: var(--color-surface); border: 1px solid var(--color-line); }
    .field { min-height: 2.5rem; border-radius: 0.5rem; border: 1px solid var(--color-line); background: var(--color-surface); padding: 0 0.5rem; }
    .size-cell {
      display: flex; flex-direction: column; align-items: center; gap: 0.125rem; width: 3.25rem; padding: 0.25rem;
      border-radius: 0.5rem; border: 1px solid var(--color-line); background: var(--color-surface);
    }
    .size-on { border-color: var(--aska); background: var(--aska-soft); color: var(--aska-soft-fg); }
    .size-input { width: 100%; min-height: 2rem; text-align: center; border-radius: 0.375rem; border: 1px solid var(--color-line); background: var(--color-surface); }
  `,
})
export class InvoiceNewProductsComponent implements OnInit {
  private readonly catalog = inject(CatalogApi);
  private readonly organization = inject(OrganizationApi);

  readonly lines = input.required<InvoiceDraftLine[]>();
  readonly created = output<InvoiceCreatedLine[]>();
  readonly closed = output<void>();

  protected readonly variants = permissionFlag('module:variants');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly rows = signal<NewProductRow[]>([]);
  protected readonly taxes = signal<Tax[]>([]);
  protected readonly units = signal<Unit[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly scales = signal<SizeScale[]>([]);
  private readonly version = signal(0);
  private pricesIncludeTax = true;
  protected margin = 30;

  protected readonly selectedCount = computed(() => {
    this.version();
    return this.rows().filter((r) => r.selected).length;
  });
  protected readonly problems = computed(() => {
    this.version();
    return this.rows().filter((r) => rowProblem(r, this.scales()) !== null).length;
  });

  ngOnInit(): void {
    forkJoin({
      taxes: this.catalog.taxes(),
      units: this.catalog.units(),
      categories: this.catalog.categories(),
      scales: this.catalog.sizeScales(),
      settings: this.organization.settings(),
    }).subscribe({
      next: (d) => {
        this.taxes.set(d.taxes.filter((t) => t.active));
        this.units.set(d.units.filter((u) => u.active));
        this.categories.set(d.categories.filter((c) => c.active));
        this.scales.set(d.scales.filter((s) => s.active));
        this.pricesIncludeTax = d.settings.pricesIncludeTax;
        this.rows.set(toRows(this.lines(), { taxes: d.taxes, scales: d.scales, margin: this.margin,
          pricesIncludeTax: this.pricesIncludeTax, variants: this.variants() }));
        this.loading.set(false);
      },
      error: () => this.closed.emit(),
    });
  }

  touch(): void {
    this.version.update((v) => v + 1);
  }

  /** Recalcula los precios con el margen nuevo (sobre lo que no se haya cambiado a mano también: es una ayuda). */
  reprice(): void {
    const fresh = toRows(this.lines(), { taxes: this.taxes(), scales: this.scales(), margin: this.margin,
      pricesIncludeTax: this.pricesIncludeTax, variants: this.variants() });
    this.rows().forEach((r) => {
      const f = fresh.find((x) => x.lineNo === r.lineNo);
      if (f && r.cost === f.cost && r.taxCode === f.taxCode) {
        r.price = f.price;
      }
    });
    this.touch();
  }

  protected sizesOf(r: NewProductRow): string[] {
    return this.scales().find((s) => s.id === r.sizeScaleId)?.sizes.map((s) => s.label) ?? [];
  }

  protected setSize(r: NewProductRow, size: string, value: number | null): void {
    r.sizeQty[size.toUpperCase()] = Math.max(0, Math.floor(Number(value) || 0));
    this.touch();
  }

  protected total(r: NewProductRow): number {
    this.version();
    return sizesTotal(r, this.scales());
  }

  protected notice(r: NewProductRow): string | null {
    this.version();
    return sizesNotice(r, this.scales());
  }

  protected problemOf(r: NewProductRow): string | null {
    this.version();
    return rowProblem(r, this.scales());
  }

  protected marginText(r: NewProductRow): string {
    const m = marginOf(r, this.taxes().map((t) => ({ code: t.code, name: t.name, rate: t.rate })), this.pricesIncludeTax);
    return m === null ? '—' : `${m} %`;
  }

  protected cop(v: number): string {
    return formatCop(v);
  }

  save(): void {
    if (this.selectedCount() === 0 || this.problems() > 0 || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.catalog.createFromInvoice(toItems(this.rows(), this.scales())).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.created.emit(res.lines);
      },
      error: () => this.saving.set(false),
    });
  }
}
