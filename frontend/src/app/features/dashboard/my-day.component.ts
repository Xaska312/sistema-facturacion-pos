import { Component, OnInit, inject, signal } from '@angular/core';
import { MyDay } from '../../core/api/api.models';
import { ReportsApi } from '../../core/api/reports.api';
import { formatCop } from '../../shared/money';

/** Ventas propias del día (cajero o vendedor sin acceso a los reportes del negocio). */
@Component({
  selector: 'app-my-day',
  template: `
    @if (data(); as d) {
      <section class="card p-4 mb-4">
        <h2 class="font-medium mb-3">Mis ventas de hoy</h2>
        <div class="grid gap-3 grid-cols-3 mb-3">
          <div>
            <p class="text-sm text-muted">Total</p>
            <p class="text-xl font-semibold">{{ cop(d.total) }}</p>
          </div>
          <div>
            <p class="text-sm text-muted">Ventas</p>
            <p class="text-xl font-semibold">{{ d.salesCount }}</p>
          </div>
          <div>
            <p class="text-sm text-muted">Ticket promedio</p>
            <p class="text-xl font-semibold">{{ cop(d.averageTicket) }}</p>
          </div>
        </div>
        @for (m of d.byPaymentMethod; track m.paymentMethodId) {
          <p class="flex justify-between text-sm"><span>{{ m.name }} ({{ m.count }})</span><span>{{ cop(m.amount) }}</span></p>
        }
      </section>
    }
  `,
})
export class MyDayComponent implements OnInit {
  private readonly reports = inject(ReportsApi);
  protected readonly cop = formatCop;
  protected readonly data = signal<MyDay | null>(null);

  ngOnInit(): void {
    this.reports.myDay().subscribe((d) => this.data.set(d));
  }
}
