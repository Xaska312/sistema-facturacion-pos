import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { forkJoin, map, of } from 'rxjs';
import { Branch, ReportSummary } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { ReportFilters, ReportsApi } from '../../core/api/reports.api';
import { AuthService } from '../../core/auth/auth.service';
import { ChartComponent } from '../../shared/charts/chart.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { PeriodFilterComponent } from '../../shared/period-filter.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import {
  DateRange,
  PeriodSelection,
  addDays,
  periodFromParams,
  periodLabel,
  periodToParams,
  previousRange,
  resolvePeriod,
} from '../reports/periods';
import { ChartData, KpiCard, buildKpis, dayChart, hourChart, paymentChart, topProductsChart } from './dashboard-data';
import { StockAlertsComponent } from './stock-alerts.component';

interface DashboardView {
  label: string;
  compareLabel: string;
  current: ReportSummary;
  kpis: KpiCard[];
  /** Solo para "Hoy" (el backend da ventas por hora solo del día actual). */
  hours: ChartData | null;
  week: ChartData;
  days: ChartData | null;
  products: ChartData;
  payments: ChartData;
}

/**
 * Tablero del negocio (reports:read): indicadores con variación frente al periodo anterior, ventas por hora o por
 * día, productos más vendidos, medios de pago y alertas de existencias. El periodo y la sucursal van en la URL
 * (?periodo=7d&sucursal=…) para poder compartir el enlace.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, ButtonModule, SkeletonModule, PeriodFilterComponent, StatCardComponent, ChartComponent,
    EmptyStateComponent, StockAlertsComponent],
  template: `
    <app-period-filter [selection]="selection()" [branches]="branches()" [showBranch]="branches().length > 1"
                       (selectionChange)="select($event)" />

    <div class="mt-4 flex flex-col gap-4" [attr.aria-busy]="loading()">
      @if (error()) {
        <div class="card p-8 flex flex-col items-center gap-3 text-center" role="alert">
          <i class="pi pi-cloud text-3xl text-muted" aria-hidden="true"></i>
          <p class="font-semibold">No pudimos cargar el tablero</p>
          <p class="text-sm text-muted">Revisa tu conexión e inténtalo de nuevo.</p>
          <p-button label="Reintentar" icon="pi pi-refresh" (onClick)="load()" />
        </div>
      } @else if (view(); as v) {
        <section aria-label="Indicadores" class="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
                 [class.opacity-60]="loading()">
          @for (k of v.kpis; track k.label) {
            <app-stat-card [label]="k.label" [value]="k.value" [icon]="k.icon" [change]="k.change"
                           [changeLabel]="v.compareLabel" [hint]="k.hint" [trend]="k.trend" />
          }
        </section>

        <div class="grid gap-4 lg:grid-cols-3" [class.opacity-60]="loading()">
          <section class="card p-4 lg:col-span-2 min-w-0" aria-labelledby="main-chart-title">
            <header class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 id="main-chart-title" class="font-semibold">{{ mainTitle() }}</h2>
              @if (v.hours) {
                <div class="flex gap-1 p-1 rounded-lg bg-surface-alt text-sm" role="group" aria-label="Vista de la gráfica">
                  <button type="button" class="px-2.5 py-1 rounded-md" [class.bg-surface]="!showWeek()"
                          [class.shadow-card]="!showWeek()" [class.text-muted]="showWeek()" [attr.aria-pressed]="!showWeek()"
                          (click)="showWeek.set(false)">Por hora</button>
                  <button type="button" class="px-2.5 py-1 rounded-md" [class.bg-surface]="showWeek()"
                          [class.shadow-card]="showWeek()" [class.text-muted]="!showWeek()" [attr.aria-pressed]="showWeek()"
                          (click)="showWeek.set(true)">Últimos 7 días</button>
                </div>
              }
            </header>
            @if (v.hours && !showWeek()) {
              @if (v.current.salesCount === 0) {
                <app-empty-state icon="pi pi-shopping-cart" title="Aún no hay ventas hoy"
                                 message="Cuando registres la primera venta verás aquí cómo van las ventas por hora."
                                 [actionLabel]="canSell ? 'Ir a vender' : null" actionIcon="pi pi-arrow-right"
                                 (action)="goSell()" />
              } @else {
                <app-chart kind="bar" [labels]="v.hours.labels" [series]="v.hours.series" categoryHeader="Hora"
                           [ariaLabel]="'Ventas por hora, ' + v.label.toLowerCase()" [height]="280" />
              }
            } @else if (v.days) {
              <app-chart kind="line" [labels]="v.days.labels" [series]="v.days.series" categoryHeader="Día"
                         [ariaLabel]="'Ventas por día, ' + v.label.toLowerCase() + ', comparadas con el periodo anterior'"
                         [height]="280" />
            } @else {
              <app-chart kind="bar" [labels]="v.week.labels" [series]="v.week.series" categoryHeader="Día"
                         ariaLabel="Ventas de los últimos 7 días" [height]="280" />
            }
          </section>

          <section class="card p-4 min-w-0" aria-labelledby="payments-title">
            <h2 id="payments-title" class="font-semibold mb-3">Medios de pago</h2>
            @if (v.payments.labels.length === 0) {
              <p class="text-sm text-muted">Sin pagos en el periodo.</p>
            } @else {
              <app-chart kind="doughnut" [labels]="v.payments.labels" [series]="v.payments.series"
                         categoryHeader="Medio de pago" ariaLabel="Ventas por medio de pago" [height]="180" />
            }
          </section>

          <section class="card p-4 lg:col-span-2 min-w-0" aria-labelledby="products-title">
            <header class="flex items-center justify-between gap-2 mb-3">
              <h2 id="products-title" class="font-semibold">Productos más vendidos</h2>
              <a routerLink="/app/reportes" [queryParams]="reportsParams('products')"
                 class="text-sm text-brand hover:underline">Ver todos</a>
            </header>
            @if (v.products.labels.length === 0) {
              <p class="text-sm text-muted">Sin ventas en el periodo.</p>
            } @else {
              <app-chart kind="bar" [horizontal]="true" [labels]="v.products.labels" [series]="v.products.series"
                         categoryHeader="Producto" ariaLabel="Productos más vendidos por valor"
                         [height]="40 + v.products.labels.length * 36" />
            }
          </section>

          <app-stock-alerts class="min-w-0" [branchId]="selection().branchId" />
        </div>

        <div>
          <a pButton routerLink="/app/reportes" [queryParams]="reportsParams(null)" label="Ver todos los reportes"
             icon="pi pi-arrow-right" iconPos="right" [text]="true"></a>
        </div>
      } @else {
        <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" aria-label="Cargando indicadores">
          @for (i of [0, 1, 2, 3]; track i) {
            <div class="card p-4 flex flex-col gap-3">
              <p-skeleton width="50%" height="0.875rem" />
              <p-skeleton width="70%" height="1.75rem" />
              <p-skeleton width="40%" height="0.75rem" />
            </div>
          }
        </div>
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="card p-4 lg:col-span-2"><p-skeleton height="18rem" /></div>
          <div class="card p-4"><p-skeleton height="18rem" /></div>
        </div>
      }
    </div>
  `,
})
export class DashboardComponent {
  private readonly reports = inject(ReportsApi);
  private readonly organization = inject(OrganizationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly canSell = inject(AuthService).hasPermission('sales:create');

  protected readonly selection = signal<PeriodSelection>({ period: 'today', from: null, to: null, branchId: null });
  protected readonly branches = signal<Branch[]>([]);
  protected readonly view = signal<DashboardView | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly showWeek = signal(false);
  private requestSeq = 0;

  protected readonly mainTitle = computed(() => {
    const v = this.view();
    if (v?.hours) {
      return this.showWeek() ? 'Últimos 7 días' : 'Ventas por hora de hoy';
    }
    return v?.days ? 'Ventas por día' : 'Últimos 7 días';
  });

  constructor() {
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' })
      .subscribe((p) => this.branches.set(p.content.filter((b) => b.active)));
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.selection.set(periodFromParams((name) => params.get(name), 'today'));
      this.load();
    });
  }

  select(selection: PeriodSelection): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: periodToParams(selection),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  load(): void {
    const selection = this.selection();
    const range = resolvePeriod(selection);
    const previous = previousRange(range);
    const singleDay = range.from === range.to;
    // Con un solo día, la tendencia de los indicadores y la gráfica semanal usan los 7 días que terminan en él.
    const trendRange: DateRange = singleDay ? { from: addDays(range.to, -6), to: range.to } : range;
    const filters = (r: DateRange): ReportFilters => ({ from: r.from, to: r.to, branchId: selection.branchId, sellerId: null });
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.error.set(false);

    forkJoin({
      current: this.reports.summary(filters(range)),
      previous: this.reports.summary(filters(previous)),
      trend: this.reports.salesBy('by-day', filters(trendRange)),
      previousDays: singleDay ? of([]) : this.reports.salesBy('by-day', filters(previous)),
      products: this.reports.products(filters(range), 'total', 5),
      payments: this.reports.byPaymentMethod(filters(range)),
      hours: selection.period === 'today'
        ? this.reports.dashboard(selection.branchId).pipe(map((d) => d.byHour))
        : of(null),
    }).subscribe({
      next: (r) => {
        if (seq !== this.requestSeq) {
          return;
        }
        const label = periodLabel(selection, range);
        this.view.set({
          label,
          compareLabel: compareLabel(selection.period),
          current: r.current,
          kpis: buildKpis(r.current, r.previous, trendRange, r.trend),
          hours: r.hours ? hourChart(r.hours) : null,
          week: dayChart(trendRange, r.trend, null, [], 'Ventas', ''),
          days: singleDay ? null : dayChart(range, r.trend, previous, r.previousDays, label, 'Periodo anterior'),
          products: topProductsChart(r.products),
          payments: paymentChart(r.payments),
        });
        this.loading.set(false);
      },
      error: () => {
        if (seq === this.requestSeq) {
          this.loading.set(false);
          this.error.set(true);
        }
      },
    });
  }

  goSell(): void {
    void this.router.navigate(['/pos']);
  }

  /** Lleva el mismo periodo y sucursal a Reportes. */
  protected reportsParams(view: string | null): Record<string, string | null> {
    return { ...periodToParams(this.selection()), vista: view };
  }
}

function compareLabel(period: PeriodSelection['period']): string {
  switch (period) {
    case 'today':
      return 'vs. ayer';
    case 'yesterday':
      return 'vs. el día anterior';
    default:
      return 'vs. periodo anterior';
  }
}
