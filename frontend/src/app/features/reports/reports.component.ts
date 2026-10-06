import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { Observable } from 'rxjs';
import {
  Branch,
  CategoryReportRow,
  InventoryValuation,
  InventoryValuationRow,
  PaymentReportRow,
  ProductReportRow,
  ReportSummary,
  SalesReportRow,
  TaxReportRow,
} from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { ReportFilters, ReportsApi } from '../../core/api/reports.api';
import { ChartComponent } from '../../shared/charts/chart.component';
import { saveDownload } from '../../shared/download';
import { formatCompactCop, formatCop, formatPercent, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { PeriodFilterComponent } from '../../shared/period-filter.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef } from '../../shared/table/table';
import { dayChart, paymentChart } from '../dashboard/dashboard-data';
import { PeriodKey, PeriodSelection, periodFromParams, periodLabel, periodToParams, resolvePeriod } from './periods';
import { ReportTab, csvFor, salesTotals } from './report-views';
import { TermComponent } from '../../shared/help/term.component';

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'days', label: 'Por día' },
  { id: 'branches', label: 'Sucursales' },
  { id: 'sellers', label: 'Vendedores' },
  { id: 'payments', label: 'Medios de pago' },
  { id: 'products', label: 'Productos' },
  { id: 'categories', label: 'Categorías' },
  { id: 'taxes', label: 'Impuestos' },
  { id: 'inventory', label: 'Inventario' },
];

const TAX_NAMES: Record<string, string> = {
  IVA: 'IVA',
  INC: 'Impuesto al consumo',
  EXEMPT: 'Exento',
  EXCLUDED: 'Excluido',
};

const REPORT_PERIODS: readonly PeriodKey[] = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'custom'];

/**
 * Reportes de ventas, utilidad, impuestos e inventario con exportación a CSV (permiso reports:read).
 * Periodo, sucursal, vendedor y pestaña van en la URL (?periodo=mes&vista=products…) para compartir el enlace.
 */
@Component({
  selector: 'app-reports',
  imports: [TermComponent, NgTemplateOutlet, ButtonModule, SkeletonModule, ChartComponent, PageHeaderComponent, PeriodFilterComponent,
    StatCardComponent, DataTableComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Reportes"
                     description="Ventas, utilidad, impuestos e inventario por periodo, con exportación a Excel (CSV).">
      <p-button label="Exportar a Excel (CSV)" icon="pi pi-download" severity="secondary" [outlined]="true"
                [loading]="exporting()" (onClick)="download()" />
    </app-page-header>

    <div class="sticky top-14 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2 mb-2 bg-ground">
      <app-period-filter [selection]="selection()" [options]="periods" [branches]="branches()"
                         [showPeriod]="tab() !== 'inventory'" (selectionChange)="select($event)">
        @if (tab() !== 'inventory') {
          <label periodExtra class="flex items-center gap-2 text-sm">
            <span class="text-muted">Vendedor</span>
            <select #sellerSelect class="border rounded-md px-2 py-1.5" [value]="sellerId() ?? ''"
                    (change)="setSeller(sellerSelect.value)">
              <option value="">Todos</option>
              @for (s of sellers(); track s.key) {
                <option [value]="s.key">{{ s.label }}</option>
              }
            </select>
          </label>
        }
      </app-period-filter>
    </div>

    <nav class="flex gap-1 mb-4 overflow-x-auto pb-1" aria-label="Tipo de reporte">
      @for (t of tabs; track t.id) {
        <button type="button" class="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border border-line transition-colors"
                [class.bg-brand]="tab() === t.id" [class.text-brand-contrast]="tab() === t.id"
                [class.bg-surface]="tab() !== t.id" [attr.aria-pressed]="tab() === t.id" (click)="selectTab(t.id)">
          {{ t.label }}
        </button>
      }
    </nav>

    <p class="sr-only" aria-live="polite">{{ loading() ? 'Cargando reporte…' : periodText() }}</p>

    @if (error()) {
      <div class="card p-8 flex flex-col items-center gap-3 text-center" role="alert">
        <p class="font-semibold">No pudimos cargar el reporte</p>
        <p class="text-sm text-muted">Revisa tu conexión e inténtalo de nuevo.</p>
        <p-button label="Reintentar" icon="pi pi-refresh" (onClick)="reload()" />
      </div>
    } @else {
      @switch (tab()) {
        @case ('summary') {
          @if (summary(); as s) {
            <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mb-4">
              <app-stat-card label="Ventas" [value]="cop(s.total)" icon="pi pi-dollar"
                             [hint]="s.salesCount.toLocaleString('es-CO') + ' ventas'" />
              <app-stat-card label="Ticket promedio" [value]="cop(s.averageTicket)" icon="pi pi-receipt" />
              <app-stat-card label="Utilidad" [value]="cop(s.profit)" icon="pi pi-chart-line"
                             [hint]="'Margen ' + pct(s.marginPercent)" />
              <app-stat-card label="Anuladas" [value]="s.voidedCount.toLocaleString('es-CO')" icon="pi pi-ban"
                             [hint]="cop(s.voidedTotal)" />
            </div>
            <section class="card p-4 text-sm max-w-xl" aria-labelledby="summary-detail">
              <h2 id="summary-detail" class="font-semibold mb-2">Detalle</h2>
              <dl class="flex flex-col gap-1">
                <div class="flex justify-between"><dt>Ventas brutas</dt><dd class="tabular-nums">{{ cop(s.grossTotal) }}</dd></div>
                <div class="flex justify-between"><dt>Descuentos</dt><dd class="tabular-nums">-{{ cop(s.discountTotal) }}</dd></div>
                <div class="flex justify-between"><dt>Base (sin impuestos)</dt><dd class="tabular-nums">{{ cop(s.subtotal) }}</dd></div>
                <div class="flex justify-between"><dt>Impuestos</dt><dd class="tabular-nums">{{ cop(s.taxTotal) }}</dd></div>
                <div class="flex justify-between font-semibold border-t border-line mt-1 pt-1">
                  <dt>Total vendido</dt><dd class="tabular-nums">{{ cop(s.total) }}</dd>
                </div>
                <div class="flex justify-between mt-2"><dt>Costo de lo vendido</dt><dd class="tabular-nums">{{ cop(s.cost) }}</dd></div>
                <div class="flex justify-between font-semibold"><dt>Utilidad (base − costo)</dt><dd class="tabular-nums">{{ cop(s.profit) }}</dd></div>
              </dl>
              <p class="text-xs text-muted mt-3">"Exportar" descarga las ventas del periodo una por una.</p>
            </section>
          } @else {
            <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              @for (i of [0, 1, 2, 3]; track i) {
                <div class="card p-4"><p-skeleton height="4.5rem" /></div>
              }
            </div>
          }
        }
        @case ('days') {
          <ng-container [ngTemplateOutlet]="totalsRow" [ngTemplateOutletContext]="{ $implicit: days() }" />
          <section class="card p-4 mb-4">
            <h2 class="font-semibold mb-3">Ventas por día</h2>
            <app-chart [kind]="dayData().labels.length > 31 ? 'line' : 'bar'" [labels]="dayData().labels"
                       [series]="dayData().series" categoryHeader="Día" ariaLabel="Ventas por día del periodo" />
          </section>
          <app-data-table [columns]="salesColumns('Día')" [items]="days()" [loading]="loading()" [trackBy]="rowKey"
                          [pageSizeOptions]="[]" caption="Ventas por día" emptyTitle="Sin ventas en el periodo" />
        }
        @case ('branches') {
          <ng-container [ngTemplateOutlet]="totalsRow" [ngTemplateOutletContext]="{ $implicit: branchRows() }" />
          @if (branchRows().length > 0) {
            <section class="card p-4 mb-4">
              <app-chart [horizontal]="true" [labels]="labelsOf(branchRows())" [series]="totalSeries(branchRows())"
                         categoryHeader="Sucursal" ariaLabel="Ventas por sucursal"
                         [height]="40 + branchRows().length * 36" />
            </section>
          }
          <app-data-table [columns]="salesColumns('Sucursal')" [items]="branchRows()" [loading]="loading()"
                          [trackBy]="rowKey" [pageSizeOptions]="[]" caption="Ventas por sucursal"
                          emptyTitle="Sin ventas en el periodo" />
        }
        @case ('sellers') {
          <ng-container [ngTemplateOutlet]="totalsRow" [ngTemplateOutletContext]="{ $implicit: sellerRows() }" />
          @if (sellerRows().length > 0) {
            <section class="card p-4 mb-4">
              <app-chart [horizontal]="true" [labels]="labelsOf(sellerRows())" [series]="totalSeries(sellerRows())"
                         categoryHeader="Vendedor" ariaLabel="Ventas por vendedor"
                         [height]="40 + sellerRows().length * 36" />
            </section>
          }
          <app-data-table [columns]="salesColumns('Vendedor')" [items]="sellerRows()" [loading]="loading()"
                          [trackBy]="rowKey" [pageSizeOptions]="[]" caption="Ventas por vendedor"
                          emptyTitle="Sin ventas en el periodo" />
        }
        @case ('payments') {
          <div class="grid gap-4 lg:grid-cols-2">
            <section class="card p-4">
              <h2 class="font-semibold mb-3">
                Distribución por <app-term term="medios-pago">medio de pago</app-term>
              </h2>
              @if (paymentData().labels.length === 0) {
                <p class="text-sm text-muted">Sin pagos en el periodo.</p>
              } @else {
                <app-chart kind="doughnut" [labels]="paymentData().labels" [series]="paymentData().series"
                           categoryHeader="Medio de pago" ariaLabel="Ventas por medio de pago" [height]="200" />
              }
            </section>
            <app-data-table [columns]="paymentColumns" [items]="payments()" [loading]="loading()" [trackBy]="paymentKey"
                            [pageSizeOptions]="[]" caption="Ventas por medio de pago" emptyTitle="Sin pagos en el periodo" />
          </div>
        }
        @case ('products') {
          <div class="flex flex-wrap items-center gap-3 mb-3">
            <label class="text-sm flex items-center gap-2">Ordenar por
              <select #orderSelect class="border rounded-md px-2 py-1.5" [value]="productOrder()"
                      (change)="setProductOrder(orderSelect.value)">
                <option value="total">Valor vendido</option>
                <option value="quantity">Cantidad</option>
              </select>
            </label>
          </div>
          @if (products().length > 0) {
            <section class="card p-4 mb-4">
              <h2 class="font-semibold mb-3">Los 10 primeros</h2>
              <app-chart [horizontal]="true" [labels]="topProductLabels()" [series]="topProductSeries()"
                         categoryHeader="Producto" ariaLabel="Los 10 productos más vendidos"
                         [format]="productOrder() === 'quantity' ? qty : cop"
                         [axisFormat]="productOrder() === 'quantity' ? qty : compactCop"
                         [height]="40 + topProductLabels().length * 32" />
            </section>
          }
          <app-data-table [columns]="productColumns" [items]="products()" [loading]="loading()" [trackBy]="productKey"
                          [pageSizeOptions]="[]" caption="Productos vendidos en el periodo" emptyTitle="Sin ventas en el periodo">
            <ng-template appCell="product" let-row>
              <span class="font-mono text-xs text-muted">{{ row.sku }}</span> {{ row.name }}
            </ng-template>
          </app-data-table>
        }
        @case ('categories') {
          @if (categories().length > 0) {
            <section class="card p-4 mb-4">
              <app-chart [horizontal]="true" [labels]="categoryLabels()" [series]="categorySeries()"
                         categoryHeader="Categoría" ariaLabel="Ventas por categoría"
                         [height]="40 + categoryLabels().length * 32" />
            </section>
          }
          <app-data-table [columns]="categoryColumns" [items]="categories()" [loading]="loading()" [trackBy]="categoryKey"
                          [pageSizeOptions]="[]" caption="Ventas por categoría" emptyTitle="Sin ventas en el periodo" />
        }
        @case ('taxes') {
          <app-data-table [columns]="taxColumns" [items]="taxes()" [loading]="loading()" [trackBy]="taxKey"
                          [pageSizeOptions]="[]" caption="Impuestos del periodo" emptyTitle="Sin ventas en el periodo" />
          <p class="text-xs text-muted mt-3">Base e impuesto de las ventas registradas (no incluye las anuladas).</p>
        }
        @case ('inventory') {
          @if (valuation(); as v) {
            <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 max-w-xl mb-4">
              <app-stat-card label="Inventario valorizado" [value]="cop(v.totalValue)" icon="pi pi-warehouse" />
              <app-stat-card label="Productos con existencia" [value]="v.productCount.toLocaleString('es-CO')" icon="pi pi-box" />
            </div>
          }
          <app-data-table [columns]="inventoryColumns" [items]="valuation()?.rows ?? null" [loading]="loading()"
                          [trackBy]="inventoryKey" [pageSizeOptions]="[]" caption="Inventario valorizado"
                          emptyTitle="No hay existencias">
            <ng-template appCell="product" let-row>
              <span class="font-mono text-xs text-muted">{{ row.sku }}</span> {{ row.name }}
            </ng-template>
          </app-data-table>
          <p class="text-xs text-muted mt-3">Existencias actuales × costo promedio ponderado.</p>
        }
      }
    }

    <ng-template #totalsRow let-rows>
      @if (totalsOf(rows); as t) {
        <div class="grid gap-3 grid-cols-1 sm:grid-cols-3 mb-4">
          <app-stat-card label="Total vendido" [value]="cop(t.total)" icon="pi pi-dollar" />
          <app-stat-card label="Ventas" [value]="t.salesCount.toLocaleString('es-CO')" icon="pi pi-shopping-bag" />
          <app-stat-card label="Utilidad" [value]="cop(t.profit)" icon="pi pi-chart-line" [hint]="'Margen ' + pct(t.marginPercent)" />
        </div>
      }
    </ng-template>
  `,
})
export class ReportsComponent {
  private readonly reports = inject(ReportsApi);
  private readonly organization = inject(OrganizationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs = TABS;
  protected readonly periods = REPORT_PERIODS;
  protected readonly cop = formatCop;
  protected readonly pct = formatPercent;
  protected readonly qty = (value: number): string => formatQuantity(value);
  protected readonly compactCop = (value: number): string => formatCompactCop(value);

  protected readonly selection = signal<PeriodSelection>({ period: 'thisMonth', from: null, to: null, branchId: null });
  protected readonly sellerId = signal<string | null>(null);
  protected readonly tab = signal<ReportTab>('summary');
  protected readonly productOrder = signal<'total' | 'quantity'>('total');
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly exporting = signal(false);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly sellers = signal<SalesReportRow[]>([]);
  protected readonly summary = signal<ReportSummary | null>(null);
  protected readonly days = signal<SalesReportRow[]>([]);
  protected readonly branchRows = signal<SalesReportRow[]>([]);
  protected readonly sellerRows = signal<SalesReportRow[]>([]);
  protected readonly payments = signal<PaymentReportRow[]>([]);
  protected readonly products = signal<ProductReportRow[]>([]);
  protected readonly categories = signal<CategoryReportRow[]>([]);
  protected readonly taxes = signal<TaxReportRow[]>([]);
  protected readonly valuation = signal<InventoryValuation | null>(null);

  protected readonly range = computed(() => resolvePeriod(this.selection()));
  protected readonly periodText = computed(() => `Periodo: ${periodLabel(this.selection(), this.range())}`);
  protected readonly dayData = computed(() => dayChart(this.range(), this.days(), null, [], 'Ventas', ''));
  protected readonly paymentData = computed(() => paymentChart(this.payments()));
  protected readonly topProductLabels = computed(() => this.products().slice(0, 10).map((p) => p.name));
  protected readonly topProductSeries = computed(() => [{
    label: this.productOrder() === 'quantity' ? 'Cantidad' : 'Vendido',
    data: this.products().slice(0, 10).map((p) => (this.productOrder() === 'quantity' ? p.quantity : p.total)),
  }]);
  protected readonly categoryLabels = computed(() => this.categories().map((c) => c.categoryName));
  protected readonly categorySeries = computed(() => [{ label: 'Vendido', data: this.categories().map((c) => c.total) }]);

  protected readonly rowKey = (row: SalesReportRow): string => row.key;
  protected readonly paymentKey = (row: PaymentReportRow): string => row.paymentMethodId;
  protected readonly productKey = (row: ProductReportRow): string => row.productId;
  protected readonly categoryKey = (row: CategoryReportRow): string => row.categoryId ?? row.categoryName;
  protected readonly taxKey = (row: TaxReportRow): string => `${row.taxType}:${row.taxRate}`;
  protected readonly inventoryKey = (row: InventoryValuationRow): string => `${row.branchId}:${row.productId}`;

  protected readonly paymentColumns: ColumnDef<PaymentReportRow>[] = [
    { header: 'Medio de pago', cell: (r) => r.name },
    { header: 'Pagos', cell: (r) => r.count, kind: 'number' },
    { header: 'Valor', cell: (r) => r.amount, kind: 'money' },
  ];
  protected readonly productColumns: ColumnDef<ProductReportRow>[] = [
    { header: 'Producto', cell: (p) => p.name, template: 'product' },
    { header: 'Categoría', cell: (p) => p.categoryName, hideOnMobile: true },
    { header: 'Cantidad', cell: (p) => `${formatQuantity(p.quantity)} ${p.unitCode}`, cellClass: 'text-right whitespace-nowrap' },
    { header: 'Total', cell: (p) => p.total, kind: 'money' },
    { header: 'Costo', cell: (p) => p.cost, kind: 'money', hideOnMobile: true },
    { header: 'Utilidad', cell: (p) => p.profit, kind: 'money' },
    { header: 'Margen', cell: (p) => formatPercent(p.marginPercent), cellClass: 'text-right' },
  ];
  protected readonly categoryColumns: ColumnDef<CategoryReportRow>[] = [
    { header: 'Categoría', cell: (c) => c.categoryName },
    { header: 'Base', cell: (c) => c.subtotal, kind: 'money', hideOnMobile: true },
    { header: 'Total', cell: (c) => c.total, kind: 'money' },
    { header: 'Costo', cell: (c) => c.cost, kind: 'money', hideOnMobile: true },
    { header: 'Utilidad', cell: (c) => c.profit, kind: 'money' },
    { header: 'Margen', cell: (c) => formatPercent(c.marginPercent), cellClass: 'text-right' },
  ];
  protected readonly taxColumns: ColumnDef<TaxReportRow>[] = [
    { header: 'Impuesto', cell: (t) => TAX_NAMES[t.taxType] ?? t.taxType },
    { header: 'Tarifa', cell: (t) => formatPercent(t.taxRate), cellClass: 'text-right' },
    { header: 'Ventas', cell: (t) => t.salesCount, kind: 'number' },
    { header: 'Base', cell: (t) => t.taxableBase, kind: 'money' },
    { header: 'Impuesto', cell: (t) => t.taxAmount, kind: 'money' },
  ];
  protected readonly inventoryColumns: ColumnDef<InventoryValuationRow>[] = [
    { header: 'Sucursal', cell: (r) => r.branchName, hideOnMobile: true },
    { header: 'Producto', cell: (r) => r.name, template: 'product' },
    { header: 'Categoría', cell: (r) => r.categoryName, hideOnMobile: true },
    { header: 'Existencia', cell: (r) => `${formatQuantity(r.quantity)} ${r.unitCode}`, cellClass: 'text-right whitespace-nowrap' },
    { header: 'Costo promedio', cell: (r) => r.averageCost, kind: 'money', hideOnMobile: true },
    { header: 'Valor', cell: (r) => r.value, kind: 'money' },
  ];

  /** Evita que una respuesta vieja (de filtros anteriores) reemplace a la última. */
  private requestSeq = 0;

  constructor() {
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.selection.set(periodFromParams((name) => params.get(name), 'thisMonth'));
      this.sellerId.set(params.get('vendedor') || null);
      const view = params.get('vista');
      this.tab.set(TABS.some((t) => t.id === view) ? (view as ReportTab) : 'summary');
      this.productOrder.set(params.get('orden') === 'cantidad' ? 'quantity' : 'total');
      this.reload();
    });
  }

  select(selection: PeriodSelection): void {
    this.updateUrl(periodToParams(selection));
  }

  selectTab(tab: ReportTab): void {
    this.updateUrl({ vista: tab === 'summary' ? null : tab });
  }

  setSeller(sellerId: string): void {
    this.updateUrl({ vendedor: sellerId || null });
  }

  setProductOrder(order: string): void {
    this.updateUrl({ orden: order === 'quantity' ? 'cantidad' : null });
  }

  reload(): void {
    const filters = this.filters();
    const seq = ++this.requestSeq;
    const current = (): boolean => seq === this.requestSeq;
    this.loading.set(true);
    this.error.set(false);
    const run = <T>(request: Observable<T>, set: (value: T) => void): void => {
      request.subscribe({
        next: (value) => {
          if (current()) {
            set(value);
            this.loading.set(false);
          }
        },
        error: () => {
          if (current()) {
            this.loading.set(false);
            this.error.set(true);
          }
        },
      });
    };
    // Vendedores con ventas en el periodo (sin el filtro de vendedor). Si el elegido no vendió, se quita el filtro.
    if (this.tab() !== 'inventory') {
      this.reports.salesBy('by-seller', { ...filters, sellerId: null }).subscribe((rows) => {
        if (!current()) {
          return;
        }
        this.sellers.set(rows);
        if (this.sellerId() && !rows.some((r) => r.key === this.sellerId())) {
          this.setSeller('');
        }
      });
    }
    switch (this.tab()) {
      case 'summary':
        this.summary.set(null);
        run(this.reports.summary(filters), (s) => this.summary.set(s));
        break;
      case 'days':
        run(this.reports.salesBy('by-day', filters), (r) => this.days.set(r));
        break;
      case 'branches':
        run(this.reports.salesBy('by-branch', filters), (r) => this.branchRows.set(r));
        break;
      case 'sellers':
        run(this.reports.salesBy('by-seller', filters), (r) => this.sellerRows.set(r));
        break;
      case 'payments':
        run(this.reports.byPaymentMethod(filters), (r) => this.payments.set(r));
        break;
      case 'products':
        run(this.reports.products(filters, this.productOrder(), 50), (r) => this.products.set(r));
        break;
      case 'categories':
        run(this.reports.categories(filters), (r) => this.categories.set(r));
        break;
      case 'taxes':
        run(this.reports.taxes(filters), (r) => this.taxes.set(r));
        break;
      case 'inventory':
        run(this.reports.valuation(filters.branchId), (v) => this.valuation.set(v));
        break;
    }
  }

  download(): void {
    const csv = csvFor(this.tab(), this.productOrder());
    this.exporting.set(true);
    this.reports.csv(csv.report, this.filters(), csv.extra).subscribe({
      next: (response) => {
        this.exporting.set(false);
        saveDownload(response, `${csv.report.replace('/', '-')}.csv`);
      },
      // El error ya se muestra en un aviso (interceptor).
      error: () => this.exporting.set(false),
    });
  }

  protected salesColumns(title: string): ColumnDef<SalesReportRow>[] {
    return [
      { header: title, cell: (r) => r.label },
      { header: 'Ventas', cell: (r) => r.salesCount, kind: 'number' },
      { header: 'Total', cell: (r) => r.total, kind: 'money' },
      { header: 'Ticket promedio', cell: (r) => r.averageTicket, kind: 'money', hideOnMobile: true },
      { header: 'Utilidad', cell: (r) => r.profit, kind: 'money' },
      { header: 'Margen', cell: (r) => formatPercent(r.marginPercent), cellClass: 'text-right', hideOnMobile: true },
    ];
  }

  protected labelsOf(rows: SalesReportRow[]): string[] {
    return rows.map((r) => r.label);
  }

  protected totalSeries(rows: SalesReportRow[]): { label: string; data: number[] }[] {
    return [{ label: 'Vendido', data: rows.map((r) => r.total) }];
  }

  /** La plantilla de totales recibe el contexto sin tipo: aquí se le da. */
  protected totalsOf(rows: unknown): ReturnType<typeof salesTotals> | null {
    return Array.isArray(rows) && rows.length > 0 ? salesTotals(rows as SalesReportRow[]) : null;
  }

  private filters(): ReportFilters {
    const range = this.range();
    return { from: range.from, to: range.to, branchId: this.selection().branchId, sellerId: this.sellerId() };
  }

  private updateUrl(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
