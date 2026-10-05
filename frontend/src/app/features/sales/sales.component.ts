import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap, throwError } from 'rxjs';
import { PageResponse, Sale, SaleRow, SaleStatus } from '../../core/api/api.models';
import { SaleFilters, SalesApi } from '../../core/api/sales.api';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusKey } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery } from '../../shared/table/table';
import { ReceiptComponent } from '../../shared/receipt/receipt.component';
import { ReceiptWidth, loadReceiptWidth, printReceipt } from '../../shared/receipt/receipt-prefs';

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  COMPLETED: 'Registrada',
  VOIDED: 'Anulada',
};

const SALE_STATUS: Record<SaleStatus, StatusKey> = { COMPLETED: 'completed', VOIDED: 'voided' };

/** Historial de ventas: detalle, reimpresión del tiquete y anulación (permiso sales:void). */
@Component({
  selector: 'app-sales',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, DataTableComponent, HasPermissionDirective,
    ReceiptComponent, PageHeaderComponent, FormDialogComponent],
  template: `
    <app-page-header title="Ventas" description="Todas las ventas registradas: detalle, reimpresión del tiquete y anulación." />

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    caption="Ventas" searchPlaceholder="Número (POS-12) o cliente" emptyIcon="pi pi-receipt"
                    emptyTitle="No hay ventas en este periodo" emptyMessage="Cambia las fechas o ve a vender."
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Desde</span>
        <input type="date" class="border rounded-md px-2 py-2" [(ngModel)]="filters.from" (ngModelChange)="reloadFirstPage()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Hasta</span>
        <input type="date" class="border rounded-md px-2 py-2" [(ngModel)]="filters.to" (ngModelChange)="reloadFirstPage()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Estado</span>
        <select class="border rounded-md px-2 py-2" [(ngModel)]="filters.status" (ngModelChange)="reloadFirstPage()">
          <option [ngValue]="null">Todas</option>
          <option [ngValue]="'COMPLETED'">Registradas</option>
          <option [ngValue]="'VOIDED'">Anuladas</option>
        </select>
      </label>
      <ng-template #actions let-row>
        <p-button label="Ver" icon="pi pi-eye" size="small" [text]="true" (onClick)="open(row)" />
      </ng-template>
    </app-data-table>

    <p-dialog [header]="detail() ? 'Venta ' + detail()!.documentNumber : 'Venta'" [(visible)]="detailOpen" [modal]="true"
              [style]="{ width: '30rem' }">
      @if (detail(); as sale) {
        @if (sale.status === 'VOIDED') {
          <p class="mb-3 p-2 rounded bg-danger-soft text-danger text-sm">
            Anulada por {{ sale.voidedByName ?? '—' }}: {{ sale.voidReason }}
          </p>
        }
        <div class="flex justify-center bg-surface-alt p-3 max-h-[60vh] overflow-auto">
          <app-receipt [sale]="sale" [width]="width" />
        </div>
      }
      <ng-template #footer>
        @if (detail(); as sale) {
          @if (sale.status === 'COMPLETED') {
            <p-button *hasPermission="'sales:void'" label="Anular" severity="danger" [text]="true"
                      (onClick)="openVoid()" />
          }
        }
        <p-button label="Reimprimir" severity="secondary" (onClick)="print()" />
        <p-button label="Cerrar" (onClick)="detailOpen = false" />
      </ng-template>
    </p-dialog>

    <app-form-dialog [(visible)]="voidOpen" header="Anular venta" width="26rem" submitLabel="Anular venta"
                     submitIcon="pi pi-ban" [destructive]="true" [dirty]="voidReason.trim().length > 0"
                     [invalidMessage]="voidReason.trim() ? null : 'Escribe el motivo de la anulación.'"
                     [save]="voidRequest" [successMessage]="null" (saved)="load(query)"
                     description="La venta queda anulada (no se borra): los productos vuelven al inventario y el efectivo se descuenta de la caja.">
      <div class="flex flex-col gap-1">
        <label for="void-reason" class="text-sm font-medium">Motivo</label>
        <input pInputText id="void-reason" maxlength="200" [(ngModel)]="voidReason" placeholder="Cliente devolvió el producto" />
      </div>
    </app-form-dialog>

    @if (detail(); as sale) {
      <app-receipt class="receipt-print-root" [sale]="sale" [width]="width" />
    }
  `,
})
export class SalesComponent implements OnInit {
  private readonly sales = inject(SalesApi);
  private readonly messages = inject(MessageService);

  protected readonly page = signal<PageResponse<SaleRow> | null>(null);
  protected readonly loading = signal(true);
  protected readonly detail = signal<Sale | null>(null);
  protected readonly width: ReceiptWidth = loadReceiptWidth();
  protected filters: SaleFilters = { from: null, to: null, status: null, search: null, cashSessionId: null };
  protected query: TableQuery = initialQuery();
  protected detailOpen = false;
  protected voidOpen = false;
  protected voidReason = '';

  protected readonly trackById = (row: SaleRow): string => row.id;
  protected readonly columns: ColumnDef<SaleRow>[] = [
    { header: 'Número', cell: (s) => s.documentNumber, kind: 'mono' },
    { header: 'Fecha', cell: (s) => s.createdAt, kind: 'datetime' },
    { header: 'Cliente', cell: (s) => s.customerName },
    { header: 'Caja', cell: (s) => `${s.registerCode ?? ''} · ${s.branchName ?? ''}`, hideOnMobile: true },
    { header: 'Vendedor', cell: (s) => s.createdByName, hideOnMobile: true },
    { header: 'Estado', cell: (s) => SALE_STATUS[s.status], kind: 'status' },
    { header: 'Total', cell: (s) => s.total, kind: 'money' },
  ];

  ngOnInit(): void {
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.sales.search({ ...this.filters, search: query.search }, query.page, query.size).subscribe({
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

  open(row: SaleRow): void {
    this.sales.sale(row.id).subscribe((sale) => {
      this.detail.set(sale);
      this.detailOpen = true;
    });
  }

  print(): void {
    printReceipt();
  }

  openVoid(): void {
    this.voidReason = '';
    this.voidOpen = true;
  }

  protected readonly voidRequest = (): Observable<Sale> => {
    const sale = this.detail();
    if (!sale) {
      return throwError(() => new Error('No hay venta seleccionada'));
    }
    return this.sales.voidSale(sale.id, this.voidReason.trim()).pipe(
      tap((voided) => {
        this.detail.set(voided);
        this.messages.add({ severity: 'success', summary: `Venta ${voided.documentNumber} anulada`, life: 3000 });
      }),
    );
  };
}
