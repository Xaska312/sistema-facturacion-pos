import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CashReport, CashSession, PageResponse } from '../../core/api/api.models';
import { CashApi, CashSessionFilters } from '../../core/api/cash.api';
import { ColumnDef, DataTableComponent } from '../../shared/data-table.component';
import { formatCop } from '../../shared/money';
import { CashReportComponent } from './cash-report.component';
import { SESSION_STATUS_LABEL, differenceLabel } from './labels';

/** Historial de sesiones de caja con su informe (permiso cash:read). */
@Component({
  selector: 'app-cash-history',
  imports: [FormsModule, RouterLink, ButtonModule, DialogModule, DataTableComponent, CashReportComponent],
  template: `
    <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">Historial de caja</h1>
      <a routerLink="/app/caja"><p-button label="Mi caja" severity="secondary" [outlined]="true" /></a>
    </div>

    <div class="flex flex-wrap gap-2 mb-3 items-end">
      <label class="flex flex-col text-sm">
        <span>Estado</span>
        <select class="border rounded px-2 py-2" [(ngModel)]="filters.status" (ngModelChange)="load(0)">
          <option [ngValue]="null">Todas</option>
          <option [ngValue]="'OPEN'">Abiertas</option>
          <option [ngValue]="'CLOSED'">Cerradas</option>
        </select>
      </label>
      <label class="flex flex-col text-sm">
        <span>Desde</span>
        <input type="date" class="border rounded px-2 py-2" [(ngModel)]="filters.from" (ngModelChange)="load(0)" />
      </label>
      <label class="flex flex-col text-sm">
        <span>Hasta</span>
        <input type="date" class="border rounded px-2 py-2" [(ngModel)]="filters.to" (ngModelChange)="load(0)" />
      </label>
    </div>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    emptyText="No hay sesiones de caja" (pageChange)="load($event)">
      <ng-template #actions let-row>
        <p-button label="Informe" size="small" [text]="true" (onClick)="openReport(row)" />
      </ng-template>
    </app-data-table>

    <p-dialog header="Informe de caja" [(visible)]="reportOpen" [modal]="true" [style]="{ width: '32rem' }">
      @if (report(); as r) {
        <app-cash-report [report]="r" />
      }
    </p-dialog>
  `,
})
export class CashHistoryComponent implements OnInit {
  private readonly cash = inject(CashApi);

  protected readonly page = signal<PageResponse<CashSession> | null>(null);
  protected readonly loading = signal(true);
  protected readonly report = signal<CashReport | null>(null);
  protected reportOpen = false;
  protected filters: CashSessionFilters = { status: null, cashRegisterId: null, from: null, to: null };

  protected readonly trackById = (row: CashSession): string => row.id;
  protected readonly columns: ColumnDef<CashSession>[] = [
    { header: 'Caja', cell: (s) => `${s.registerCode ?? ''} · ${s.branchName ?? ''}` },
    { header: 'Cajero', cell: (s) => s.openedByName ?? '—' },
    { header: 'Apertura', cell: (s) => new Date(s.openedAt).toLocaleString('es-CO') },
    { header: 'Cierre', cell: (s) => (s.closedAt ? new Date(s.closedAt).toLocaleString('es-CO') : '—') },
    { header: 'Estado', cell: (s) => SESSION_STATUS_LABEL[s.status] },
    { header: 'Contado', cell: (s) => formatCop(s.countedAmount), cellClass: 'text-right' },
    {
      header: 'Arqueo',
      cell: (s) => (s.difference === null ? '—' : `${differenceLabel(s.difference)} ${formatCop(s.difference)}`),
    },
  ];

  ngOnInit(): void {
    this.load(0);
  }

  load(page: number): void {
    this.loading.set(true);
    this.cash.sessions(this.filters, page).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openReport(session: CashSession): void {
    this.cash.report(session.id).subscribe((report) => {
      this.report.set(report);
      this.reportOpen = true;
    });
  }
}
