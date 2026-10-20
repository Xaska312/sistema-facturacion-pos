import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { OrderFilter, OrderRow, OrderSummary, PageResponse } from '../../core/api/api.models';
import { OrdersApi } from '../../core/api/orders.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { LatestRequest } from '../../shared/latest-request';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { dueLabel, formatDay, orderBadge } from './order-text';

const FILTERS: { value: OrderFilter; label: string }[] = [
  { value: 'OPEN', label: 'Por entregar' },
  { value: 'OVERDUE', label: 'Atrasados' },
  { value: 'DELIVERED', label: 'Entregados' },
  { value: 'CANCELLED', label: 'Cancelados' },
  { value: 'ALL', label: 'Todos' },
];

/** Pedidos por encargo: por entregar (los más próximos primero), atrasados, entregados y cancelados (decisión 258). */
@Component({
  selector: 'app-orders',
  imports: [FormsModule, RouterLink, ButtonModule, PageHeaderComponent, StatCardComponent, StatusBadgeComponent,
    DataTableComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Pedidos"
                     description="Trabajos por encargo: lo que el cliente pidió, cuándo se entrega y cuánto ha abonado.">
      @if (canCreate()) {
        <a pButton routerLink="/app/pedidos/nuevo" label="Nuevo pedido" icon="pi pi-plus"></a>
      }
    </app-page-header>

    @if (summary(); as s) {
      <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <app-stat-card label="Por entregar" [value]="'' + s.open" icon="pi pi-calendar"
                       [hint]="s.dueSoon > 0 ? s.dueSoon + ' en los próximos 3 días' : null" />
        <app-stat-card label="Para hoy" [value]="'' + s.dueToday" icon="pi pi-clock" />
        <app-stat-card label="Atrasados" [value]="'' + s.overdue" icon="pi pi-exclamation-triangle"
                       [hint]="s.overdue > 0 ? 'Ya pasó la fecha de entrega' : null" />
        <app-stat-card label="Falta por cobrar" [value]="cop(s.balanceDue)" icon="pi pi-wallet"
                       hint="De los pedidos por entregar" />
      </div>
    }

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    searchPlaceholder="Buscar por cliente, documento o número" caption="Pedidos"
                    emptyIcon="pi pi-calendar" [emptyTitle]="emptyTitle()"
                    emptyMessage="Registra aquí los trabajos por encargo: mesones, tortas, uniformes… Al entregarlos se convierten en una venta."
                    [emptyActionLabel]="canCreate() ? 'Nuevo pedido' : null" (emptyAction)="goNew()"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span class="sr-only">Mostrar</span>
        <select class="border rounded px-2 py-2" aria-label="Qué pedidos mostrar" [ngModel]="current"
                (ngModelChange)="current = $event; reloadFirstPage()">
          @for (f of filters; track f.value) {
            <option [value]="f.value">{{ f.label }}</option>
          }
        </select>
      </label>
      <ng-template appCell="number" let-row>
        <a class="text-brand font-medium hover:underline font-mono" [routerLink]="['/app/pedidos', row.id]">{{ row.number }}</a>
      </ng-template>
      <ng-template appCell="due" let-row>
        <span>{{ day(row.dueDate) }}</span>
        @if (row.status === 'OPEN') {
          <span class="block text-xs" [class.text-danger]="row.overdue" [class.font-medium]="row.overdue"
                [class.text-muted]="!row.overdue">{{ due(row) }}</span>
        }
      </ng-template>
      <ng-template appCell="status" let-row>
        <app-status-badge [status]="badge(row).key" [label]="badge(row).label" />
      </ng-template>
      <ng-template appCell="progress" let-row>
        <span class="tabular-nums">{{ row.deliveredCount }} de {{ row.itemCount }}</span>
      </ng-template>
      <ng-template #actions let-row>
        <a pButton [text]="true" size="small" label="Ver" icon="pi pi-eye" [routerLink]="['/app/pedidos', row.id]"></a>
      </ng-template>
    </app-data-table>
  `,
})
export class OrdersComponent implements OnInit {
  /** ?filtro=OVERDUE: llega desde el aviso del inicio. */
  readonly filtro = input<string>();

  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latest = new LatestRequest();
  private readonly api = inject(OrdersApi);
  private readonly router = inject(Router);
  protected readonly canCreate = permissionFlag('orders:create');

  protected readonly filters = FILTERS;
  protected readonly summary = signal<OrderSummary | null>(null);
  protected readonly page = signal<PageResponse<OrderRow> | null>(null);
  protected readonly loading = signal(true);
  protected current: OrderFilter = 'OPEN';
  private query: TableQuery = initialQuery();

  protected readonly cop = formatCop;
  protected readonly day = formatDay;
  protected readonly trackById = (row: OrderRow): string => row.id;
  protected readonly columns: ColumnDef<OrderRow>[] = [
    { header: 'Pedido', cell: (o) => o.number, template: 'number' },
    { header: 'Cliente', cell: (o) => o.customerName },
    { header: 'Entrega', cell: (o) => o.dueDate, template: 'due' },
    { header: 'Estado', cell: (o) => o.status, template: 'status' },
    { header: 'Entregado', cell: (o) => o.deliveredCount, template: 'progress', hideOnMobile: true },
    { header: 'Total', cell: (o) => o.total, kind: 'money', hideOnMobile: true },
    { header: 'Abonado', cell: (o) => o.deposited, kind: 'money', hideOnMobile: true },
    { header: 'Falta pagar', cell: (o) => o.balanceDue, kind: 'money' },
  ];

  ngOnInit(): void {
    const wanted = this.filtro();
    if (FILTERS.some((f) => f.value === wanted)) {
      this.current = wanted as OrderFilter;
    }
    this.api.summary().subscribe((summary) => this.summary.set(summary));
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
      case 'OVERDUE':
        return 'No hay pedidos atrasados';
      case 'DELIVERED':
        return 'Aún no hay pedidos entregados';
      case 'CANCELLED':
        return 'No hay pedidos cancelados';
      default:
        return 'No hay pedidos por entregar';
    }
  }

  protected badge(row: OrderRow) {
    return orderBadge(row);
  }

  protected due(row: OrderRow): string {
    return dueLabel(row.dueDate, new Date(), row.overdue);
  }

  goNew(): void {
    void this.router.navigate(['/app/pedidos/nuevo']);
  }
}
