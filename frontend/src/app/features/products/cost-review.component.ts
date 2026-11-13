import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogApi, CostReviewRow } from '../../core/api/catalog.api';
import { ConfirmService } from '../../shared/confirm';
import { formatCop, formatPercent } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ToastService } from '../../shared/ui/toast.service';

/**
 * Revisar costos con IVA (decisión 349). Antes de la decisión 348 el costo se escribía "como te cuesta" (con IVA) y la
 * app lo usaba como si fuera sin IVA: la utilidad, los reportes y el resumen de Aska salían más bajos. Aquí el dueño
 * marca los productos cuyo costo traía el IVA y se le quita a su costo y al de sus ventas ya hechas.
 */
@Component({
  selector: 'app-cost-review',
  imports: [PageHeaderComponent, SkeletonComponent, ButtonComponent, RouterLink],
  template: `
    <app-page-header title="Revisar costos con IVA"
                     description="Corrige los costos que se escribieron con IVA para que la utilidad salga bien." />

    <section class="card p-4 max-w-5xl flex flex-col gap-2 text-sm">
      <p>La app guarda el costo <strong>sin IVA</strong>, porque así lo compara con la venta sin IVA (el IVA es de la
        DIAN). Si escribiste el costo como te lo cobra el proveedor, con IVA, la ganancia sale más baja de lo que es: por
        ejemplo, una leche que cuesta $5.650 y se vende en $6.800 muestra 1,1 % de margen cuando de verdad es 16,9 %.</p>
      <p>Marca los productos cuyo costo traía el IVA y toca <strong>Quitar el IVA</strong>. Se corrige el costo del
        producto y el de sus ventas ya hechas, así los reportes, la utilidad y el resumen de Aska quedan bien. Queda en la
        auditoría y en el kardex. Los productos con compras registradas ya tienen el costo sin IVA de la factura:
        revísalos antes de marcarlos.</p>
      <p class="text-muted">De aquí en adelante el campo de costo dice si lo escribes con o sin IVA
        (<a routerLink="/app/ajustes" class="text-brand hover:underline">Ajustes</a> → "Los costos de mis proveedores
        traen el IVA incluido").</p>
    </section>

    <section class="card p-4 mt-4 max-w-5xl flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-3 justify-between">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="size-4" [checked]="onlySuspicious()" (change)="onlySuspicious.set($any($event.target).checked)" />
          Solo los que tienen un margen muy bajo (menos del 5 %)
        </label>
        <app-button [label]="'Quitar el IVA a ' + selectedCount() + (selectedCount() === 1 ? ' producto' : ' productos')"
                    icon="pi pi-check" [disabled]="selectedCount() === 0" [loading]="saving()" (clicked)="confirmFix()" />
      </div>

      @if (rows() === null) {
        <app-skeleton height="12rem" />
      } @else if (visible().length === 0) {
        <p class="text-sm text-muted py-6 text-center" role="status">
          {{ onlySuspicious() ? 'No hay productos con un margen sospechosamente bajo.' : 'No hay productos con IVA y costo.' }}
        </p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surface-alt text-left">
              <tr>
                <th class="p-2 w-10"><input type="checkbox" class="size-4" aria-label="Marcar todos los de la lista"
                                            [checked]="allVisibleSelected()" (change)="toggleAll($any($event.target).checked)" /></th>
                <th class="p-2">Producto</th>
                <th class="p-2 text-right">Precio</th>
                <th class="p-2 text-right">Costo guardado</th>
                <th class="p-2 text-right">Sin IVA</th>
                <th class="p-2 text-right">Margen ahora → corregido</th>
                <th class="p-2 text-right">Ventas</th>
              </tr>
            </thead>
            <tbody>
              @for (r of visible(); track r.productId) {
                <tr class="border-t" [class.bg-warning-soft]="r.suspicious">
                  <td class="p-2"><input type="checkbox" class="size-4" [attr.aria-label]="'Quitar el IVA al costo de ' + r.name"
                                         [checked]="selected().has(r.productId)" (change)="toggle(r.productId, $any($event.target).checked)" /></td>
                  <td class="p-2">
                    <a [routerLink]="['/app/productos', r.productId]" class="font-medium hover:underline">{{ r.name }}</a>
                    <span class="block text-xs text-muted">{{ r.sku }} · IVA {{ r.taxRate }} %@if (r.purchased) { · con compras}</span>
                  </td>
                  <td class="p-2 text-right tabular-nums">{{ cop(r.salePrice) }}</td>
                  <td class="p-2 text-right tabular-nums">{{ cop(r.cost) }}</td>
                  <td class="p-2 text-right tabular-nums">{{ cop(r.costWithoutTax) }}</td>
                  <td class="p-2 text-right tabular-nums whitespace-nowrap">
                    <span [class.text-danger]="(r.marginNow ?? 0) < 5">{{ pct(r.marginNow) }}</span> → {{ pct(r.marginFixed) }}</td>
                  <td class="p-2 text-right tabular-nums">{{ r.soldLines }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class CostReviewComponent implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly confirm = inject(ConfirmService);
  private readonly messages = inject(ToastService);

  protected readonly rows = signal<CostReviewRow[] | null>(null);
  protected readonly onlySuspicious = signal(true);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly saving = signal(false);
  protected readonly cop = formatCop;
  protected readonly pct = formatPercent;

  protected readonly visible = computed(() => (this.rows() ?? []).filter((r) => !this.onlySuspicious() || r.suspicious));
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly allVisibleSelected = computed(() =>
    this.visible().length > 0 && this.visible().every((r) => this.selected().has(r.productId)));

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.costReview().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        // Se proponen los sospechosos sin compras (los que con seguridad se escribieron a mano).
        this.selected.set(new Set(rows.filter((r) => r.suspicious && !r.purchased).map((r) => r.productId)));
      },
      error: () => this.rows.set([]),
    });
  }

  protected toggle(id: string, on: boolean): void {
    const next = new Set(this.selected());
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selected.set(next);
  }

  protected toggleAll(on: boolean): void {
    const next = new Set(this.selected());
    for (const r of this.visible()) {
      if (on) {
        next.add(r.productId);
      } else {
        next.delete(r.productId);
      }
    }
    this.selected.set(next);
  }

  protected confirmFix(): void {
    const ids = [...this.selected()];
    this.confirm.ask({
      header: 'Quitar el IVA del costo',
      message: `A ${ids.length === 1 ? '1 producto' : ids.length + ' productos'} se le quita el IVA al costo y al de sus `
        + 'ventas ya hechas. Hazlo solo con los que escribiste con IVA: no se puede deshacer desde aquí.',
      acceptLabel: 'Quitar el IVA',
      accept: () => this.fix(ids),
    });
  }

  private fix(ids: string[]): void {
    this.saving.set(true);
    this.api.removeCostTax(ids).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Costos corregidos',
          detail: `${r.products} ${r.products === 1 ? 'producto' : 'productos'} y ${r.saleLines} líneas de ventas.` });
        this.rows.set(null);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }
}
