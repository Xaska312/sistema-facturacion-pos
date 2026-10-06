import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CashReport, CashSession, PageResponse } from '../../core/api/api.models';
import { CashApi, CashSessionFilters } from '../../core/api/cash.api';
import { AuthService } from '../../core/auth/auth.service';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { cashDifferenceStatus } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery } from '../../shared/table/table';
import { CashReportComponent } from './cash-report.component';
import { differenceLabel } from './labels';
import { TermComponent } from '../../shared/help/term.component';

/** Historial de sesiones de caja con su informe (permiso cash:read). */
@Component({
  selector: 'app-cash-history',
  imports: [TermComponent, FormsModule, RouterLink, ButtonModule, DialogModule, DataTableComponent, CashReportComponent,
    PageHeaderComponent],
  template: `
    <app-page-header title="Historial de caja" description="Aperturas y cierres de todas las cajas, con su arqueo.">
      <a pButton routerLink="/app/caja" label="Mi caja" icon="pi pi-wallet" severity="secondary" [outlined]="true"></a>
    </app-page-header>

    <p class="text-sm text-muted -mt-3 mb-4">
      La columna <app-term term="arqueo">Arqueo</app-term> dice si cada caja cerró cuadrada, con faltante o con sobrante.
    </p>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    caption="Sesiones de caja" emptyIcon="pi pi-history" emptyTitle="No hay sesiones de caja"
                    emptyMessage="Cuando alguien abra una caja, aparecerá aquí con su informe."
                    [emptyActionLabel]="canOperate ? 'Ir a Mi caja' : null" emptyActionIcon="pi pi-wallet"
                    (emptyAction)="goToCash()"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Estado</span>
        <select class="border rounded-md px-2 py-2" [(ngModel)]="filters.status" (ngModelChange)="reloadFirstPage()">
          <option [ngValue]="null">Todas</option>
          <option [ngValue]="'OPEN'">Abiertas</option>
          <option [ngValue]="'CLOSED'">Cerradas</option>
        </select>
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Desde</span>
        <input type="date" class="border rounded-md px-2 py-2" [(ngModel)]="filters.from" (ngModelChange)="reloadFirstPage()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Hasta</span>
        <input type="date" class="border rounded-md px-2 py-2" [(ngModel)]="filters.to" (ngModelChange)="reloadFirstPage()" />
      </label>
      <ng-template #actions let-row>
        <p-button label="Informe" icon="pi pi-file" size="small" [text]="true" (onClick)="openReport(row)" />
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
  private readonly router = inject(Router);
  protected readonly canOperate = inject(AuthService).hasPermission('cash:operate');

  protected readonly page = signal<PageResponse<CashSession> | null>(null);
  protected readonly loading = signal(true);
  protected readonly report = signal<CashReport | null>(null);
  protected reportOpen = false;
  protected filters: CashSessionFilters = { status: null, cashRegisterId: null, from: null, to: null };

  protected readonly trackById = (row: CashSession): string => row.id;
  protected query: TableQuery = initialQuery();
  protected readonly columns: ColumnDef<CashSession>[] = [
    { header: 'Caja', cell: (s) => `${s.registerCode ?? ''} · ${s.branchName ?? ''}` },
    { header: 'Cajero', cell: (s) => s.openedByName },
    { header: 'Apertura', cell: (s) => s.openedAt, kind: 'datetime' },
    { header: 'Cierre', cell: (s) => s.closedAt, kind: 'datetime', hideOnMobile: true },
    { header: 'Estado', cell: (s) => (s.status === 'OPEN' ? 'open' : 'closed'), kind: 'status' },
    { header: 'Contado', cell: (s) => s.countedAmount, kind: 'money' },
    {
      // Sin cash:audit el servidor no envía la diferencia (cierre ciego): la celda queda en "—".
      header: 'Arqueo',
      cell: (s) => (s.difference === null ? null : cashDifferenceStatus(s.difference)),
      kind: 'status',
      statusLabel: (s) => arqueoText(s.difference),
    },
  ];

  goToCash(): void {
    void this.router.navigate(['/app/caja']);
  }

  ngOnInit(): void {
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.cash.sessions(this.filters, query.page, query.size).subscribe({
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

  openReport(session: CashSession): void {
    this.cash.report(session.id).subscribe((report) => {
      this.report.set(report);
      this.reportOpen = true;
    });
  }
}

/** "Faltante $ 2.000", "Sobrante $ 500" o "Cuadrada". */
export function arqueoText(difference: number | null): string {
  if (difference === null) {
    return '—';
  }
  return `${differenceLabel(difference)}${difference === 0 ? '' : ` ${formatCop(Math.abs(difference))}`}`;
}
