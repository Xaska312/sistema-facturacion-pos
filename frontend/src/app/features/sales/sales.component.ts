import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PageResponse, Sale, SaleRow, SaleStatus } from '../../core/api/api.models';
import { SaleFilters, SalesApi } from '../../core/api/sales.api';
import { ColumnDef, DataTableComponent } from '../../shared/data-table.component';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { formatCop } from '../../shared/money';
import { ReceiptComponent } from '../../shared/receipt/receipt.component';
import { ReceiptWidth, loadReceiptWidth, printReceipt } from '../../shared/receipt/receipt-prefs';

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  COMPLETED: 'Registrada',
  VOIDED: 'Anulada',
};

/** Historial de ventas: detalle, reimpresión del tiquete y anulación (permiso sales:void). */
@Component({
  selector: 'app-sales',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, DataTableComponent, HasPermissionDirective,
    ReceiptComponent],
  template: `
    <h1 class="text-2xl font-semibold mb-4">Ventas</h1>

    <div class="flex flex-wrap gap-2 mb-3 items-end">
      <label class="flex flex-col text-sm">
        <span>Desde</span>
        <input type="date" class="border rounded px-2 py-2" [(ngModel)]="filters.from" (ngModelChange)="load(0)" />
      </label>
      <label class="flex flex-col text-sm">
        <span>Hasta</span>
        <input type="date" class="border rounded px-2 py-2" [(ngModel)]="filters.to" (ngModelChange)="load(0)" />
      </label>
      <label class="flex flex-col text-sm">
        <span>Estado</span>
        <select class="border rounded px-2 py-2" [(ngModel)]="filters.status" (ngModelChange)="load(0)">
          <option [ngValue]="null">Todas</option>
          <option [ngValue]="'COMPLETED'">Registradas</option>
          <option [ngValue]="'VOIDED'">Anuladas</option>
        </select>
      </label>
      <input pInputText class="w-full md:w-72" placeholder="Número (POS-12) o cliente" [(ngModel)]="filters.search"
             (keyup.enter)="load(0)" />
      <p-button label="Buscar" [text]="true" (onClick)="load(0)" />
    </div>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    emptyText="No hay ventas" (pageChange)="load($event)">
      <ng-template #actions let-row>
        <p-button label="Ver" size="small" [text]="true" (onClick)="open(row)" />
      </ng-template>
    </app-data-table>

    <p-dialog [header]="detail() ? 'Venta ' + detail()!.documentNumber : 'Venta'" [(visible)]="detailOpen" [modal]="true"
              [style]="{ width: '30rem' }">
      @if (detail(); as sale) {
        @if (sale.status === 'VOIDED') {
          <p class="mb-3 p-2 rounded bg-red-50 text-red-800 text-sm">
            Anulada por {{ sale.voidedByName ?? '—' }}: {{ sale.voidReason }}
          </p>
        }
        <div class="flex justify-center bg-slate-100 p-3 max-h-[60vh] overflow-auto">
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

    <p-dialog header="Anular venta" [(visible)]="voidOpen" [modal]="true" [style]="{ width: '26rem' }">
      <p class="text-sm text-slate-600 mb-3">
        La venta queda anulada (no se borra): los productos vuelven al inventario y el efectivo se descuenta de la caja.
      </p>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Motivo</span>
        <input pInputText maxlength="200" [(ngModel)]="voidReason" />
      </label>
      <ng-template #footer>
        <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="voidOpen = false" />
        <p-button label="Anular venta" severity="danger" [loading]="saving()" [disabled]="!voidReason.trim()"
                  (onClick)="confirmVoid()" />
      </ng-template>
    </p-dialog>

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
  protected readonly saving = signal(false);
  protected readonly width: ReceiptWidth = loadReceiptWidth();
  protected filters: SaleFilters = { from: null, to: null, status: null, search: null, cashSessionId: null };
  protected detailOpen = false;
  protected voidOpen = false;
  protected voidReason = '';

  protected readonly trackById = (row: SaleRow): string => row.id;
  protected readonly columns: ColumnDef<SaleRow>[] = [
    { header: 'Número', cell: (s) => s.documentNumber, cellClass: 'font-mono' },
    { header: 'Fecha', cell: (s) => new Date(s.createdAt).toLocaleString('es-CO') },
    { header: 'Cliente', cell: (s) => s.customerName },
    { header: 'Caja', cell: (s) => `${s.registerCode ?? ''} · ${s.branchName ?? ''}` },
    { header: 'Vendedor', cell: (s) => s.createdByName ?? '—' },
    { header: 'Estado', cell: (s) => SALE_STATUS_LABEL[s.status] },
    { header: 'Total', cell: (s) => formatCop(s.total), cellClass: 'text-right' },
  ];

  ngOnInit(): void {
    this.load(0);
  }

  load(page: number): void {
    this.loading.set(true);
    this.sales.search({ ...this.filters, search: this.filters.search?.trim() || null }, page).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
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

  confirmVoid(): void {
    const sale = this.detail();
    if (!sale || !this.voidReason.trim()) {
      return;
    }
    this.saving.set(true);
    this.sales.voidSale(sale.id, this.voidReason.trim()).subscribe({
      next: (voided) => {
        this.saving.set(false);
        this.voidOpen = false;
        this.detail.set(voided);
        this.messages.add({ severity: 'success', summary: `Venta ${voided.documentNumber} anulada` });
        this.load(this.page()?.page ?? 0);
      },
      error: () => this.saving.set(false),
    });
  }
}
