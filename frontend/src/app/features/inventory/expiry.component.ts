import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Branch, PageResponse } from '../../core/api/api.models';
import { InventoryApi, LotRow, LotStatus, LotSummary, UnlottedRow } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { LatestRequest } from '../../shared/latest-request';
import { formatCop, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { formatDay } from '../orders/order-text';
import { expiryBadge, expiryText } from './lot-text';

type Filter = LotStatus | 'ALL';

/**
 * Vencimientos (Fase 13-3, decisión 281): lo vencido (no se puede vender: darlo de baja o devolverlo al proveedor), lo
 * que vence dentro de los meses de aviso de Ajustes y los productos que aún tienen existencia sin lote.
 */
@Component({
  selector: 'app-expiry',
  imports: [FormsModule, RouterLink, ButtonModule, PageHeaderComponent, StatusBadgeComponent, DataTableComponent,
    CellTemplateDirective],
  template: `
    <app-page-header title="Vencimientos"
                     description="Lo vencido no se vende: dalo de baja con acta o devuélvelo al proveedor. Lo que vence pronto, rótalo primero.">
      <a pButton routerLink="/app/inventario/trazabilidad" label="Trazabilidad de un lote" icon="pi pi-search"
         [outlined]="true"></a>
    </app-page-header>

    <div class="flex flex-wrap gap-3 items-end max-w-5xl mb-3">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Sucursal</span>
        <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="branchId" (ngModelChange)="branchId = $event; reload()">
          <option value="">Todas</option>
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
    </div>

    @if (summary(); as s) {
      <section class="grid gap-3 sm:grid-cols-3 max-w-5xl">
        <button type="button" class="card p-4 text-left" [class.ring-2]="filter === 'EXPIRED'" (click)="setFilter('EXPIRED')">
          <span class="block text-xs text-muted">Vencidos</span>
          <span class="text-2xl font-bold tabular-nums" [class.text-danger]="s.expiredLots > 0">{{ s.expiredLots }}
            {{ s.expiredLots === 1 ? 'lote' : 'lotes' }}</span>
          <span class="block text-xs text-muted">{{ cop(s.expiredValue) }} al costo</span>
        </button>
        <button type="button" class="card p-4 text-left" [class.ring-2]="filter === 'EXPIRING'" (click)="setFilter('EXPIRING')">
          <span class="block text-xs text-muted">Vencen en los próximos {{ s.alertMonths }} meses</span>
          <span class="text-2xl font-bold tabular-nums" [class.text-warning]="s.expiringLots > 0">{{ s.expiringLots }}
            {{ s.expiringLots === 1 ? 'lote' : 'lotes' }}</span>
          <span class="block text-xs text-muted">{{ cop(s.expiringValue) }} al costo · se cambia en Ajustes</span>
        </button>
        <a class="card p-4 text-left" href="#sin-lote">
          <span class="block text-xs text-muted">Con existencia sin lote</span>
          <span class="text-2xl font-bold tabular-nums" [class.text-warning]="s.unlottedProducts > 0">{{ s.unlottedProducts }}
            {{ s.unlottedProducts === 1 ? 'producto' : 'productos' }}</span>
          <span class="block text-xs text-muted">Cárgales el lote con un conteo</span>
        </a>
      </section>
    }

    <div class="mt-4 max-w-5xl">
      <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackBy" caption="Lotes"
                      searchPlaceholder="Buscar producto, SKU o lote" emptyIcon="pi pi-calendar"
                      [emptyTitle]="emptyTitle()" emptyMessage="Los lotes llegan con las compras, los saldos iniciales y los conteos."
                      (queryChange)="load($event)">
        <label tableToolbar class="flex items-center gap-2 text-sm">
          <span class="sr-only">Mostrar</span>
          <select class="border rounded-[10px] px-3 min-h-11" aria-label="Qué lotes mostrar" [ngModel]="filter"
                  (ngModelChange)="setFilter($event)">
            <option value="EXPIRED">Vencidos</option>
            <option value="EXPIRING">Por vencer</option>
            <option value="ALL">Todos los lotes</option>
          </select>
        </label>
        <ng-template appCell="product" let-row>
          <span class="font-mono text-xs text-muted">{{ row.sku }}</span> {{ row.name }}
          <span class="block text-xs text-muted">{{ row.branchName }}</span>
        </ng-template>
        <ng-template appCell="expiry" let-row>
          <span>{{ row.expirationDate ? day(row.expirationDate) : 'Sin fecha' }}</span>
          <span class="block"><app-status-badge [status]="badge(row).key" [label]="badge(row).label" /></span>
        </ng-template>
        <ng-template #actions let-row>
          <span class="flex flex-wrap justify-end gap-1">
            @if (canAdjust() && row.status !== 'OK') {
              <a pButton size="small" [text]="true" label="Dar de baja" icon="pi pi-trash" severity="danger"
                 [routerLink]="['/app/inventario/nuevo', 'baja']" [queryParams]="{ producto: row.productId, lote: row.lotNumber }"></a>
            }
            <a pButton size="small" [text]="true" label="Trazar" icon="pi pi-search" routerLink="/app/inventario/trazabilidad"
               [queryParams]="{ producto: row.productId, lote: row.lotNumber }"></a>
          </span>
        </ng-template>
      </app-data-table>
    </div>

    <section id="sin-lote" class="card p-4 mt-4 max-w-5xl">
      <h2 class="font-bold tracking-tight">Existencia sin lote</h2>
      <p class="text-xs text-muted mb-2">Productos que ahora controlan lotes y tienen existencias de antes. Se venden
        primero; para cargarles el lote haz un conteo físico: cuenta cada lote y deja "Sin lote" en 0.</p>
      @for (u of unlotted(); track u.productId + u.branchId) {
        <p class="flex flex-wrap justify-between gap-2 border-t first:border-t-0 py-2 text-sm">
          <span><span class="font-mono text-xs text-muted">{{ u.sku }}</span> {{ u.name }}
            <span class="text-muted"> · {{ u.branchName }}</span></span>
          <span class="flex items-center gap-2">
            <span class="tabular-nums">{{ q(u.quantity) }} {{ u.unitCode }}</span>
            @if (canAdjust()) {
              <a class="text-brand text-xs hover:underline" [routerLink]="['/app/inventario/nuevo', 'conteo']"
                 [queryParams]="{ producto: u.productId }">Contar</a>
            }
          </span>
        </p>
      } @empty {
        <p class="text-sm text-muted">Todo tiene lote.</p>
      }
    </section>
  `,
})
export class ExpiryComponent implements OnInit {
  /** ?filtro=EXPIRING, por ejemplo (desde el tablero). */
  readonly filtro = input<string>();

  private readonly latest = new LatestRequest();
  private readonly api = inject(InventoryApi);
  private readonly organization = inject(OrganizationApi);
  protected readonly canAdjust = permissionFlag('inventory:adjust');

  protected readonly branches = signal<Branch[]>([]);
  protected readonly summary = signal<LotSummary | null>(null);
  protected readonly page = signal<PageResponse<LotRow> | null>(null);
  protected readonly unlotted = signal<UnlottedRow[]>([]);
  protected readonly loading = signal(true);
  protected branchId = '';
  protected filter: Filter = 'EXPIRED';
  private query: TableQuery = initialQuery();

  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly day = formatDay;
  protected readonly trackBy = (row: LotRow): string => row.branchId + row.lotId;
  protected readonly badge = expiryBadge;
  protected readonly columns: ColumnDef<LotRow>[] = [
    { header: 'Producto', cell: (r) => r.name, template: 'product' },
    { header: 'Lote', cell: (r) => r.lotNumber, kind: 'mono' },
    { header: 'Vence', cell: (r) => expiryText(r), template: 'expiry' },
    { header: 'Cantidad', cell: (r) => r.quantity, kind: 'number' },
    { header: 'Valor', cell: (r) => r.value, kind: 'money', hideOnMobile: true },
  ];

  ngOnInit(): void {
    const wanted = this.filtro();
    if (wanted === 'EXPIRING' || wanted === 'EXPIRED' || wanted === 'ALL') {
      this.filter = wanted;
    }
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) =>
      this.branches.set(p.content.filter((b) => b.active)));
    this.reload();
  }

  protected emptyTitle(): string {
    return this.filter === 'EXPIRED' ? 'No hay lotes vencidos' : this.filter === 'EXPIRING'
      ? 'Nada vence pronto' : 'Aún no hay lotes';
  }

  setFilter(filter: Filter): void {
    this.filter = filter;
    this.load({ ...this.query, page: 0 });
  }

  reload(): void {
    const branch = this.branchId || null;
    this.api.lotSummary(branch).subscribe((s) => this.summary.set(s));
    this.api.unlotted(branch).subscribe((u) => this.unlotted.set(u));
    this.load({ ...this.query, page: 0 });
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.lots(this.branchId || null, this.filter === 'ALL' ? null : this.filter, query.search, toPageQuery(query))
      .pipe(this.latest.only()).subscribe({
        next: (result) => {
          this.page.set(result);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
