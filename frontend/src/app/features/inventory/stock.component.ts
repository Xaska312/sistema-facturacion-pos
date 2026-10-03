import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { Branch, PageResponse, StockAlert, StockRow } from '../../core/api/api.models';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { ColumnDef, DataTableComponent } from '../../shared/data-table.component';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { formatCop, formatQuantity } from '../../shared/money';
import { STATUS_LABEL } from './labels';

/** Existencias por sucursal, alertas de mínimo y niveles mínimo/máximo. */
@Component({
  selector: 'app-stock',
  imports: [FormsModule, RouterLink, ButtonModule, DialogModule, InputTextModule, TagModule, DataTableComponent,
    HasPermissionDirective],
  template: `
    <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">Existencias</h1>
      <a routerLink="/app/inventario/movimientos"><p-button label="Movimientos" severity="secondary" [outlined]="true" /></a>
    </div>

    @if (alerts().length > 0) {
      <section class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm">
        <p class="font-medium text-amber-900">{{ alerts().length }} producto(s) en o por debajo del mínimo</p>
        <ul class="mt-1 text-amber-900">
          @for (a of alerts().slice(0, 5); track a.branchId + a.productId) {
            <li>{{ a.name }} — {{ q(a.quantity) }} {{ a.unitCode }} (mín. {{ q(a.minStock) }}) · {{ a.branchName }}</li>
          }
        </ul>
      </section>
    }

    <div class="flex flex-wrap gap-2 mb-3 items-center">
      <select class="border rounded px-2 py-2 text-sm" [ngModel]="branchId" (ngModelChange)="branchId = $event; reload()">
        @for (b of branches(); track b.id) {
          <option [value]="b.id">{{ b.name }}</option>
        }
      </select>
      <input pInputText class="w-full md:w-80" placeholder="Buscar por nombre, SKU o código" [(ngModel)]="search"
             (keyup.enter)="load(0)" />
      <p-button label="Buscar" [text]="true" (onClick)="load(0)" />
    </div>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    emptyText="No hay productos que controlen inventario" (pageChange)="load($event)">
      <ng-template #actions let-row>
        <span class="inline-flex gap-2 items-center">
          <p-tag [value]="statusText(row)" [severity]="statusSeverity(row)" />
          <a [routerLink]="['/app/inventario/kardex', row.productId]" [queryParams]="{ branchId: row.branchId }">
            <p-button label="Kardex" size="small" [text]="true" />
          </a>
          <p-button *hasPermission="'inventory:adjust'" label="Mín./máx." size="small" [text]="true" (onClick)="openLevels(row)" />
        </span>
      </ng-template>
    </app-data-table>

    <p-dialog [(visible)]="levelsOpen" [modal]="true" header="Niveles de existencia" [style]="{ width: '24rem' }">
      <p class="text-sm text-slate-600 mb-3">{{ editing()?.name }} ({{ editing()?.unitCode }})</p>
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
      <p class="text-xs text-slate-500 mt-2">Deja vacío para no usar alerta.</p>
      <div class="flex justify-end gap-2 mt-4">
        <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="levelsOpen = false" />
        <p-button label="Guardar" (onClick)="saveLevels()" />
      </div>
    </p-dialog>
  `,
})
export class StockComponent implements OnInit {
  private readonly api = inject(InventoryApi);
  private readonly organization = inject(OrganizationApi);
  private readonly messages = inject(MessageService);
  protected readonly auth = inject(AuthService);

  // La fila de la plantilla llega como `any`: estos métodos le dan tipo antes de indexar.
  protected statusText(row: StockRow): string {
    return STATUS_LABEL[row.status];
  }

  protected statusSeverity(row: StockRow): 'danger' | 'warn' | 'success' {
    return row.status === 'LOW' ? 'danger' : row.status === 'OVER' ? 'warn' : 'success';
  }
  protected readonly q = formatQuantity;
  protected readonly branches = signal<Branch[]>([]);
  protected readonly page = signal<PageResponse<StockRow> | null>(null);
  protected readonly alerts = signal<StockAlert[]>([]);
  protected readonly loading = signal(true);
  protected readonly editing = signal<StockRow | null>(null);
  protected branchId = '';
  protected search = '';
  protected levelsOpen = false;
  protected minStock: number | null = null;
  protected maxStock: number | null = null;
  private currentPage = 0;

  protected readonly trackById = (row: StockRow): string => row.productId;
  protected readonly columns: ColumnDef<StockRow>[] = [
    { header: 'SKU', cell: (r) => r.sku, cellClass: 'font-mono' },
    { header: 'Producto', cell: (r) => r.name },
    { header: 'Existencia', cell: (r) => `${formatQuantity(r.quantity)} ${r.unitCode}` },
    { header: 'Mín. / máx.', cell: (r) => `${formatQuantity(r.minStock)} / ${formatQuantity(r.maxStock)}` },
    { header: 'Costo prom.', cell: (r) => formatCop(r.averageCost) },
    { header: 'Valor', cell: (r) => formatCop(r.stockValue) },
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
    this.load(0);
    this.api.alerts(this.branchId || null).subscribe((list) => this.alerts.set(list));
  }

  load(page: number): void {
    if (!this.branchId) {
      return;
    }
    this.currentPage = page;
    this.loading.set(true);
    this.api.stock(this.branchId, { page, size: 20, sort: 'name,asc' }, this.search.trim() || null).subscribe({
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
      this.load(this.currentPage);
      this.api.alerts(this.branchId || null).subscribe((list) => this.alerts.set(list));
    });
  }
}
