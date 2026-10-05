import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Branch, KardexRow, PageResponse, Product } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { formatCop, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery } from '../../shared/table/table';
import { MOVEMENT_LABEL, documentNumber } from './labels';

/** Kardex de un producto: movimientos con saldo después de cada uno. */
@Component({
  selector: 'app-kardex',
  imports: [FormsModule, DataTableComponent, CellTemplateDirective, PageHeaderComponent],
  template: `
    <app-page-header title="Kardex" [description]="subtitle()" />

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackByEntry" [pageSize]="50"
                    [pageSizeOptions]="[20, 50, 100]" caption="Movimientos del producto, del más reciente al más antiguo"
                    emptyIcon="pi pi-list" emptyTitle="Sin movimientos en el periodo"
                    emptyMessage="Cambia la sucursal o las fechas para ver otros movimientos."
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Sucursal</span>
        <select class="border rounded-md px-2 py-2" [(ngModel)]="branch" (ngModelChange)="reloadFirstPage()">
          <option value="">Todas</option>
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Desde</span>
        <input type="date" class="border rounded-md px-2 py-2" [(ngModel)]="from" (ngModelChange)="reloadFirstPage()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Hasta</span>
        <input type="date" class="border rounded-md px-2 py-2" [(ngModel)]="to" (ngModelChange)="reloadFirstPage()" />
      </label>
      <ng-template appCell="quantity" let-row>
        <span class="font-mono" [class.text-danger]="row.quantity < 0" [class.text-success]="row.quantity > 0">
          {{ signedQuantity(row.quantity) }}
        </span>
      </ng-template>
    </app-data-table>
  `,
})
export class KardexComponent implements OnInit {
  /** Parámetro de ruta :productId. */
  readonly productId = input.required<string>();
  /** Parámetro de consulta ?branchId. */
  readonly branchId = input<string>();

  private readonly api = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly organization = inject(OrganizationApi);

  protected readonly product = signal<Product | null>(null);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly page = signal<PageResponse<KardexRow> | null>(null);
  protected readonly loading = signal(true);
  protected readonly subtitle = computed(() => {
    const p = this.product();
    return p ? `${p.sku} — ${p.name} · costo promedio ${formatCop(p.cost)} por ${p.baseUnitCode ?? 'unidad'}` : null;
  });
  protected branch = '';
  protected from = '';
  protected to = '';
  private query: TableQuery = initialQuery(50);

  protected readonly trackByEntry = (row: KardexRow): number => row.entryNo;
  protected readonly columns: ColumnDef<KardexRow>[] = [
    { header: 'Fecha', cell: (m) => m.createdAt, kind: 'datetime' },
    { header: 'Movimiento', cell: (m) => MOVEMENT_LABEL[m.type] },
    { header: 'Documento', cell: (m) => documentNumber(m.documentNumber), kind: 'mono', hideOnMobile: true },
    { header: 'Sucursal', cell: (m) => m.branchName, hideOnMobile: true },
    { header: 'Cantidad', cell: (m) => m.quantity, kind: 'number', template: 'quantity' },
    { header: 'Saldo', cell: (m) => m.balanceAfter, kind: 'number' },
    { header: 'Costo unit.', cell: (m) => m.unitCost, kind: 'money', hideOnMobile: true },
    { header: 'Responsable', cell: (m) => m.createdByName, hideOnMobile: true },
    { header: 'Motivo', cell: (m) => m.reason, hideOnMobile: true },
  ];

  protected signedQuantity(quantity: number): string {
    return `${quantity > 0 ? '+' : ''}${formatQuantity(quantity)}`;
  }

  ngOnInit(): void {
    this.branch = this.branchId() ?? '';
    this.catalog.product(this.productId()).subscribe((p) => this.product.set(p));
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.kardex(this.productId(), this.branch || null, this.from || null, this.to || null, query.page, query.size)
      .subscribe({
        next: (result) => {
          this.page.set(result);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  reloadFirstPage(): void {
    this.load({ ...this.query, page: 0 });
  }
}
