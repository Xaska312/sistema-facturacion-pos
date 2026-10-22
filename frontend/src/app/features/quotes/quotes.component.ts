import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PageResponse, QuoteFilter, QuoteRow } from '../../core/api/api.models';
import { QuotesApi } from '../../core/api/quotes.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { LatestRequest } from '../../shared/latest-request';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { formatDay } from '../orders/order-text';
import { QUOTE_FILTERS, quoteBadge, validLabel } from './quote-text';

/** Cotizaciones: vigentes, vencidas, aceptadas y rechazadas, las más recientes primero (decisión 260). */
@Component({
  selector: 'app-quotes',
  imports: [FormsModule, RouterLink, ButtonModule, PageHeaderComponent, StatusBadgeComponent, DataTableComponent,
    CellTemplateDirective],
  template: `
    <app-page-header title="Cotizaciones"
                     description="Precios que le ofreces a un cliente antes de que compre. Si acepta, se convierten en pedido o en venta.">
      @if (canCreate()) {
        <a pButton routerLink="/app/cotizaciones/nueva" label="Nueva cotización" icon="pi pi-plus"></a>
      }
    </app-page-header>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    searchPlaceholder="Buscar por cliente, documento, teléfono o número" caption="Cotizaciones"
                    emptyIcon="pi pi-file-edit" [emptyTitle]="emptyTitle()"
                    emptyMessage="Cotiza un mesón, una lista de útiles o un pedido al por mayor y compártelo en PDF o por WhatsApp."
                    [emptyActionLabel]="canCreate() ? 'Nueva cotización' : null" (emptyAction)="goNew()"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span class="sr-only">Mostrar</span>
        <select class="border rounded px-2 py-2" aria-label="Qué cotizaciones mostrar" [ngModel]="current"
                (ngModelChange)="current = $event; reloadFirstPage()">
          @for (f of filters; track f.value) {
            <option [value]="f.value">{{ f.label }}</option>
          }
        </select>
      </label>
      <ng-template appCell="number" let-row>
        <a class="text-brand font-medium hover:underline font-mono" [routerLink]="['/app/cotizaciones', row.id]">{{ row.number }}</a>
      </ng-template>
      <ng-template appCell="party" let-row>
        <span>{{ row.partyName }}</span>
        @if (!row.customerId) {
          <span class="block text-xs text-muted">Sin registrar</span>
        }
      </ng-template>
      <ng-template appCell="valid" let-row>
        <span>{{ day(row.validUntil) }}</span>
        @if (row.status === 'OPEN') {
          <span class="block text-xs" [class.text-danger]="row.expired" [class.text-muted]="!row.expired">{{ valid(row) }}</span>
        }
      </ng-template>
      <ng-template appCell="status" let-row>
        <app-status-badge [status]="badge(row).key" [label]="badge(row).label" />
        @if (row.convertedNumber) {
          <span class="block text-xs text-muted font-mono">{{ row.convertedNumber }}</span>
        }
      </ng-template>
      <ng-template #actions let-row>
        <a pButton [text]="true" size="small" label="Ver" icon="pi pi-eye" [routerLink]="['/app/cotizaciones', row.id]"></a>
      </ng-template>
    </app-data-table>
  `,
})
export class QuotesComponent implements OnInit {
  /** ?filtro=EXPIRED, por ejemplo. */
  readonly filtro = input<string>();

  private readonly latest = new LatestRequest();
  private readonly api = inject(QuotesApi);
  private readonly router = inject(Router);
  protected readonly canCreate = permissionFlag('quotes:create');

  protected readonly filters = QUOTE_FILTERS;
  protected readonly page = signal<PageResponse<QuoteRow> | null>(null);
  protected readonly loading = signal(true);
  protected current: QuoteFilter = 'OPEN';
  private query: TableQuery = initialQuery();

  protected readonly day = formatDay;
  protected readonly trackById = (row: QuoteRow): string => row.id;
  protected readonly columns: ColumnDef<QuoteRow>[] = [
    { header: 'Cotización', cell: (q) => q.number, template: 'number' },
    { header: 'Para', cell: (q) => q.partyName, template: 'party' },
    { header: 'Válida hasta', cell: (q) => q.validUntil, template: 'valid' },
    { header: 'Estado', cell: (q) => q.status, template: 'status' },
    { header: 'Líneas', cell: (q) => q.itemCount, kind: 'number', hideOnMobile: true },
    { header: 'Total', cell: (q) => q.total, kind: 'money' },
  ];

  ngOnInit(): void {
    const wanted = this.filtro();
    if (QUOTE_FILTERS.some((f) => f.value === wanted)) {
      this.current = wanted as QuoteFilter;
    }
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.list(toPageQuery(query), this.current, query.search).pipe(this.latest.only()).subscribe({
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

  protected emptyTitle(): string {
    switch (this.current) {
      case 'EXPIRED':
        return 'No hay cotizaciones vencidas';
      case 'ACCEPTED':
        return 'Aún no hay cotizaciones aceptadas';
      case 'REJECTED':
        return 'No hay cotizaciones rechazadas';
      case 'ALL':
        return 'Aún no hay cotizaciones';
      default:
        return 'No hay cotizaciones vigentes';
    }
  }

  protected badge(row: QuoteRow) {
    return quoteBadge(row);
  }

  protected valid(row: QuoteRow): string {
    return validLabel(row.validUntil, new Date(), row.expired);
  }

  goNew(): void {
    void this.router.navigate(['/app/cotizaciones/nueva']);
  }
}
