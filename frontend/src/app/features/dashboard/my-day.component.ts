import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { MyDay } from '../../core/api/api.models';
import { ReportsApi } from '../../core/api/reports.api';
import { AuthService } from '../../core/auth/auth.service';
import { ChartComponent } from '../../shared/charts/chart.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { formatCop } from '../../shared/money';
import { StatCardComponent } from '../../shared/stat-card.component';
import { paymentChart } from './dashboard-data';

/** "Mi día": ventas propias de hoy (cajero o vendedor sin acceso a los reportes del negocio). */
@Component({
  selector: 'app-my-day',
  imports: [ButtonModule, SkeletonModule, ChartComponent, EmptyStateComponent, StatCardComponent],
  template: `
    <section aria-labelledby="my-day-title" class="flex flex-col gap-4">
      <h2 id="my-day-title" class="text-lg font-semibold">Mi día</h2>
      @if (error()) {
        <div class="card p-6 flex flex-col items-center gap-3 text-center" role="alert">
          <p class="font-semibold">No pudimos cargar tus ventas de hoy</p>
          <p-button label="Reintentar" icon="pi pi-refresh" (onClick)="load()" />
        </div>
      } @else if (data(); as d) {
        <div class="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <app-stat-card label="Vendido hoy" [value]="cop(d.total)" icon="pi pi-dollar" />
          <app-stat-card label="Ventas" [value]="d.salesCount.toLocaleString('es-CO')" icon="pi pi-shopping-bag" />
          <app-stat-card label="Ticket promedio" [value]="cop(d.averageTicket)" icon="pi pi-receipt" />
        </div>
        @if (d.salesCount === 0) {
          <div class="card">
            <app-empty-state icon="pi pi-shopping-cart" title="Aún no tienes ventas hoy"
                             message="Tus ventas del día aparecen aquí apenas las registres."
                             [actionLabel]="canSell ? 'Ir a vender' : null" actionIcon="pi pi-arrow-right"
                             (action)="sell()" />
          </div>
        } @else {
          <section class="card p-4 max-w-xl" aria-labelledby="my-day-payments">
            <h3 id="my-day-payments" class="font-semibold mb-3">Cómo te pagaron</h3>
            <app-chart kind="doughnut" [labels]="payments().labels" [series]="payments().series"
                       categoryHeader="Medio de pago" ariaLabel="Mis ventas de hoy por medio de pago" [height]="180" />
          </section>
        }
      } @else {
        <div class="grid gap-3 grid-cols-1 sm:grid-cols-3">
          @for (i of [0, 1, 2]; track i) {
            <div class="card p-4"><p-skeleton height="4.5rem" /></div>
          }
        </div>
      }
    </section>
  `,
})
export class MyDayComponent implements OnInit {
  private readonly reports = inject(ReportsApi);
  private readonly router = inject(Router);
  protected readonly canSell = inject(AuthService).hasPermission('sales:create');
  protected readonly cop = formatCop;
  protected readonly data = signal<MyDay | null>(null);
  protected readonly error = signal(false);
  protected readonly payments = computed(() => paymentChart(this.data()?.byPaymentMethod ?? []));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error.set(false);
    this.reports.myDay().subscribe({
      next: (d) => this.data.set(d),
      error: () => this.error.set(true),
    });
  }

  sell(): void {
    void this.router.navigate(['/pos']);
  }
}
