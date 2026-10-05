import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Dashboard } from '../../core/api/api.models';
import { ReportsApi } from '../../core/api/reports.api';
import { BarChartComponent } from '../../shared/charts/bar-chart.component';
import { BarItem } from '../../shared/charts/bar-scale';
import { formatCop, formatPercent } from '../../shared/money';

/** Tablero del día para quien tiene reports:read: ventas, ticket promedio, utilidad y gráficas. */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, BarChartComponent],
  template: `
    @if (data(); as d) {
      <div class="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
        <div class="card p-4">
          <p class="text-sm text-muted">Ventas de hoy</p>
          <p class="text-2xl font-semibold">{{ cop(d.today.total) }}</p>
          <p class="text-xs" [class.text-success]="change() >= 0" [class.text-danger]="change() < 0">
            {{ changeText() }}
          </p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-muted">Número de ventas</p>
          <p class="text-2xl font-semibold">{{ d.today.salesCount }}</p>
          @if (d.today.voidedCount > 0) {
            <p class="text-xs text-muted">{{ d.today.voidedCount }} anulada(s)</p>
          }
        </div>
        <div class="card p-4">
          <p class="text-sm text-muted">Ticket promedio</p>
          <p class="text-2xl font-semibold">{{ cop(d.today.averageTicket) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-muted">Utilidad de hoy</p>
          <p class="text-2xl font-semibold">{{ cop(d.today.profit) }}</p>
          <p class="text-xs text-muted">Margen {{ pct(d.today.marginPercent) }}</p>
        </div>
      </div>

      <div class="grid gap-3 lg:grid-cols-2 mb-4">
        <section class="card p-4">
          <h2 class="font-medium mb-3">Ventas por hora (hoy)</h2>
          <app-bar-chart orientation="vertical" [items]="hours()" [format]="cop" [labelEvery]="3"
                         ariaLabel="Ventas por hora de hoy" />
        </section>
        <section class="card p-4">
          <h2 class="font-medium mb-3">Últimos 7 días</h2>
          <app-bar-chart orientation="vertical" [items]="week()" [format]="cop" ariaLabel="Ventas de los últimos 7 días" />
        </section>
        <section class="card p-4">
          <h2 class="font-medium mb-3">Productos más vendidos hoy</h2>
          <app-bar-chart [items]="top()" [format]="cop" ariaLabel="Productos más vendidos hoy" />
        </section>
        <section class="card p-4">
          <h2 class="font-medium mb-3">Medios de pago hoy</h2>
          <app-bar-chart [items]="methods()" [format]="cop" ariaLabel="Medios de pago de hoy" />
        </section>
      </div>
      <a routerLink="/app/reportes" class="text-sm text-brand hover:underline">Ver todos los reportes</a>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly reports = inject(ReportsApi);

  protected readonly cop = formatCop;
  protected readonly pct = formatPercent;
  protected readonly data = signal<Dashboard | null>(null);

  protected readonly hours = computed<BarItem[]>(() =>
    (this.data()?.byHour ?? []).map((h) => ({ label: `${h.hour}h`, value: h.total })),
  );
  protected readonly week = computed<BarItem[]>(() =>
    (this.data()?.last7Days ?? []).map((d) => ({ label: d.date.slice(5), value: d.total })),
  );
  protected readonly top = computed<BarItem[]>(() =>
    (this.data()?.topProducts ?? []).map((p) => ({ label: p.name, value: p.total })),
  );
  protected readonly methods = computed<BarItem[]>(() =>
    (this.data()?.byPaymentMethod ?? []).map((m) => ({ label: m.name, value: m.amount, hint: `${m.count} pagos` })),
  );
  /** Variación frente a ayer (%), redondeada a un decimal; 0 si ayer no hubo ventas. */
  protected readonly change = computed(() => {
    const d = this.data();
    if (!d || !d.yesterdayTotal) {
      return 0;
    }
    // "|| 0" evita mostrar "-0 %".
    return Math.round(((d.today.total - d.yesterdayTotal) / d.yesterdayTotal) * 1000) / 10 || 0;
  });
  protected readonly changeText = computed(() => {
    const d = this.data();
    if (!d) {
      return '';
    }
    if (!d.yesterdayTotal) {
      return `Ayer: ${formatCop(0)}`;
    }
    const sign = this.change() > 0 ? '+' : '';
    return `${sign}${formatPercent(this.change())} frente a ayer`;
  });

  ngOnInit(): void {
    this.reports.dashboard(null).subscribe((d) => this.data.set(d));
  }
}
