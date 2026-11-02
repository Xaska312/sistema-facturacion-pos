import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PageResponse } from '../../core/api/api.models';
import { PurchaseSummary, PurchasesApi } from '../../core/api/purchases.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { LatestRequest } from '../../shared/latest-request';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { formatDay } from '../orders/order-text';
import { purchaseBadge, receiptNumber } from './purchase-text';

/** Compras recibidas (Fase 13-2, decisión 280): las más recientes primero, con lo que falta por pagar. */
@Component({
  selector: 'app-purchases',
  imports: [RouterLink, ButtonModule, PageHeaderComponent, StatusBadgeComponent, DataTableComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Compras"
                     description="La mercancía que recibes de tus proveedores, contra su factura. Al registrarla sube el inventario y el costo promedio.">
      @if (canPay()) {
        <a pButton routerLink="/app/cuentas-por-pagar" label="Cuentas por pagar" icon="pi pi-wallet" [outlined]="true"></a>
      }
      @if (canReceive()) {
        <a pButton routerLink="/app/compras/nueva" label="Recibir mercancía" icon="pi pi-plus"></a>
      }
    </app-page-header>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById" caption="Compras"
                    emptyIcon="pi pi-truck" emptyTitle="Aún no hay compras"
                    emptyMessage="Cuando llegue un pedido, regístralo con la factura del proveedor: revisas cada producto, anotas lote y vencimiento y sube el inventario."
                    [emptyActionLabel]="canReceive() ? 'Recibir mercancía' : null" (emptyAction)="goNew()"
                    (queryChange)="load($event)">
      <ng-template appCell="number" let-row>
        <a class="text-brand font-medium hover:underline font-mono" [routerLink]="['/app/compras', row.id]">{{ number(row.number) }}</a>
      </ng-template>
      <ng-template appCell="supplier" let-row>
        <span>{{ row.supplierName }}</span>
        <span class="block text-xs text-muted">Factura {{ row.supplierInvoice }} · {{ day(row.invoiceDate) }}</span>
      </ng-template>
      <ng-template appCell="status" let-row>
        <app-status-badge [status]="badge(row).key" [label]="badge(row).label" />
        @if (row.rejectedTotal > 0) {
          <span class="block text-xs text-muted">Con rechazos</span>
        }
      </ng-template>
      <ng-template #actions let-row>
        <a pButton [text]="true" size="small" label="Ver" icon="pi pi-eye" [routerLink]="['/app/compras', row.id]"></a>
      </ng-template>
    </app-data-table>
  `,
})
export class PurchasesComponent implements OnInit {
  private readonly latest = new LatestRequest();
  private readonly api = inject(PurchasesApi);
  private readonly router = inject(Router);
  protected readonly canReceive = permissionFlag('purchases:receive');
  protected readonly canPay = permissionFlag('purchases:pay');

  protected readonly page = signal<PageResponse<PurchaseSummary> | null>(null);
  protected readonly loading = signal(true);
  private query: TableQuery = initialQuery();

  protected readonly day = formatDay;
  protected readonly number = receiptNumber;
  protected readonly badge = purchaseBadge;
  protected readonly trackById = (row: PurchaseSummary): string => row.id;
  protected readonly columns: ColumnDef<PurchaseSummary>[] = [
    { header: 'Recepción', cell: (p) => p.number, template: 'number' },
    { header: 'Proveedor', cell: (p) => p.supplierName, template: 'supplier' },
    { header: 'Sucursal', cell: (p) => p.branchName, hideOnMobile: true },
    { header: 'Estado', cell: (p) => p.balance, template: 'status' },
    { header: 'Total', cell: (p) => p.total, kind: 'money' },
    { header: 'Saldo', cell: (p) => p.balance, kind: 'money', hideOnMobile: true },
  ];

  ngOnInit(): void {
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.list(toPageQuery(query), null).pipe(this.latest.only()).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  goNew(): void {
    void this.router.navigate(['/app/compras/nueva']);
  }
}
