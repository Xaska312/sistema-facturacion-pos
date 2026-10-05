import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { Branch, PageResponse, StockAlert, StockRow, StockStatus } from '../../core/api/api.models';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusKey } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';

const STOCK_STATUS: Record<StockStatus, StatusKey> = { LOW: 'stock-low', OK: 'stock-ok', OVER: 'stock-over' };

/** Existencias por sucursal, alertas de mínimo y niveles mínimo/máximo. */
@Component({
  selector: 'app-stock',
  imports: [FormsModule, RouterLink, ButtonModule, DialogModule, InputTextModule, DataTableComponent, PageHeaderComponent],
  template: `
    <app-page-header title="Existencias" description="Cuánto hay de cada producto en cada sucursal y cuánto vale.">
      <a pButton routerLink="/app/inventario/movimientos" label="Movimientos" icon="pi pi-arrow-right-arrow-left"
         severity="secondary" [outlined]="true"></a>
    </app-page-header>

    @if (alerts().length > 0) {
      <section class="bg-warning-soft border border-warning/40 rounded-xl p-3 mb-4 text-sm" aria-label="Alertas de existencias">
        <p class="font-medium text-warning-soft-fg flex items-center gap-2">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          {{ alerts().length }} producto(s) en o por debajo del mínimo
        </p>
        <ul class="mt-1 text-warning-soft-fg">
          @for (a of alerts().slice(0, 5); track a.branchId + a.productId) {
            <li>{{ a.name }} — {{ q(a.quantity) }} {{ a.unitCode }} (mín. {{ q(a.minStock) }}) · {{ a.branchName }}</li>
          }
        </ul>
      </section>
    }

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    initialSort="name,asc" caption="Existencias por producto" searchPlaceholder="Buscar por nombre, SKU o código"
                    emptyIcon="pi pi-warehouse" emptyTitle="No hay productos con control de inventario"
                    emptyMessage="Los productos que marques con “controla inventario” aparecen aquí con su existencia."
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span class="sr-only">Sucursal</span>
        <select class="border rounded-md px-2 py-2" [ngModel]="branchId" (ngModelChange)="branchId = $event; reload()">
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
      <ng-template #actions let-row>
        <a pButton [routerLink]="['/app/inventario/kardex', row.productId]" [queryParams]="{ branchId: row.branchId }"
           label="Kardex" icon="pi pi-list" size="small" [text]="true"></a>
        @if (canAdjust) {
          <p-button label="Mín./máx." icon="pi pi-sliders-h" size="small" [text]="true" (onClick)="openLevels(row)" />
        }
      </ng-template>
    </app-data-table>

    <p-dialog [(visible)]="levelsOpen" [modal]="true" header="Niveles de existencia" [style]="{ width: '24rem' }">
      <p class="text-sm text-muted mb-3">{{ editing()?.name }} ({{ editing()?.unitCode }})</p>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Mínimo</span>
          <input pInputText type="number" min="0" [(ngModel)]="minStock" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Máximo</span>
          <input pInputText type="number" min="0" [(ngModel)]="maxStock" />
        </label>
      </div>
      <p class="text-xs text-muted mt-2">Con mínimo, recibes una alerta cuando la existencia llega a ese valor. Deja vacío
        para no usar alerta.</p>
      <div class="flex justify-end gap-2 mt-4">
        <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="levelsOpen = false" />
        <p-button label="Guardar" icon="pi pi-check" (onClick)="saveLevels()" />
      </div>
    </p-dialog>
  `,
})
export class StockComponent implements OnInit {
  private readonly api = inject(InventoryApi);
  private readonly organization = inject(OrganizationApi);
  private readonly messages = inject(MessageService);
  protected readonly canAdjust = inject(AuthService).hasPermission('inventory:adjust');

  protected readonly q = formatQuantity;
  protected readonly branches = signal<Branch[]>([]);
  protected readonly page = signal<PageResponse<StockRow> | null>(null);
  protected readonly alerts = signal<StockAlert[]>([]);
  protected readonly loading = signal(true);
  protected readonly editing = signal<StockRow | null>(null);
  protected branchId = '';
  protected levelsOpen = false;
  protected minStock: number | null = null;
  protected maxStock: number | null = null;
  protected query: TableQuery = initialQuery(20, 'name,asc');

  protected readonly trackById = (row: StockRow): string => row.productId;
  protected readonly columns: ColumnDef<StockRow>[] = [
    { header: 'SKU', cell: (r) => r.sku, kind: 'mono', sortField: 'sku', hideOnMobile: true },
    { header: 'Producto', cell: (r) => r.name, sortField: 'name' },
    { header: 'Existencia', cell: (r) => `${formatQuantity(r.quantity)} ${r.unitCode}`, cellClass: 'text-right tabular-nums' },
    { header: 'Mín. / máx.', cell: (r) => `${formatQuantity(r.minStock)} / ${formatQuantity(r.maxStock)}`, hideOnMobile: true },
    { header: 'Costo prom.', cell: (r) => r.averageCost, kind: 'money', hideOnMobile: true },
    { header: 'Valor', cell: (r) => r.stockValue, kind: 'money' },
    { header: 'Estado', cell: (r) => STOCK_STATUS[r.status], kind: 'status' },
  ];

  ngOnInit(): void {
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => {
      const active = p.content.filter((b) => b.active);
      this.branches.set(active);
      this.branchId = active.find((b) => b.code === 'PRINCIPAL')?.id ?? active[0]?.id ?? '';
      this.reload();
    });
  }

  reload(): void {
    this.load({ ...this.query, page: 0 });
    this.api.alerts(this.branchId || null).subscribe((list) => this.alerts.set(list));
  }

  load(query: TableQuery): void {
    this.query = query;
    if (!this.branchId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.stock(this.branchId, toPageQuery(query), query.search).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openLevels(row: StockRow): void {
    this.editing.set(row);
    this.minStock = row.minStock;
    this.maxStock = row.maxStock;
    this.levelsOpen = true;
  }

  saveLevels(): void {
    const row = this.editing();
    if (!row) {
      return;
    }
    const toNumber = (v: number | null): number | null => (v === null || String(v) === '' ? null : Number(v));
    this.api.setLevels(row.branchId, row.productId, toNumber(this.minStock), toNumber(this.maxStock)).subscribe(() => {
      this.levelsOpen = false;
      this.messages.add({ severity: 'success', summary: 'Niveles guardados' });
      this.load(this.query);
      this.api.alerts(this.branchId || null).subscribe((list) => this.alerts.set(list));
    });
  }
}
