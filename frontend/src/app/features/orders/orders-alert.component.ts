import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderSummary } from '../../core/api/api.models';
import { OrdersApi } from '../../core/api/orders.api';
import { permissionFlag } from '../../core/auth/permission-flag';

/**
 * Aviso del inicio (decisión 258): pedidos atrasados o para hoy, con acceso directo. No muestra nada si no hay
 * ninguno, si no se tiene orders:read o si la consulta falla (el inicio no debe llenarse de errores).
 */
@Component({
  selector: 'app-orders-alert',
  imports: [RouterLink],
  template: `
    @if (summary(); as s) {
      @if (s.overdue > 0 || s.dueToday > 0) {
        <section class="card p-4 flex flex-wrap items-center gap-3" role="status" aria-label="Pedidos por entregar">
          <i class="pi pi-calendar text-xl" [class.text-danger]="s.overdue > 0" [class.text-warning]="s.overdue === 0"
             aria-hidden="true"></i>
          <p class="flex-1 text-sm">
            @if (s.overdue > 0) {
              <strong class="text-danger">{{ s.overdue }} {{ s.overdue === 1 ? 'pedido atrasado' : 'pedidos atrasados' }}</strong>
              @if (s.dueToday > 0) {
                y
              }
            }
            @if (s.dueToday > 0) {
              <strong>{{ s.dueToday }} para entregar hoy</strong>
            }
          </p>
          <a class="text-brand font-medium hover:underline text-sm" routerLink="/app/pedidos"
             [queryParams]="{ filtro: s.overdue > 0 ? 'OVERDUE' : 'OPEN' }">Ver pedidos</a>
        </section>
      }
    }
  `,
})
export class OrdersAlertComponent implements OnInit {
  private readonly api = inject(OrdersApi);
  private readonly canRead = permissionFlag('orders:read');
  protected readonly summary = signal<OrderSummary | null>(null);

  ngOnInit(): void {
    if (this.canRead()) {
      this.api.summary(true).subscribe({ next: (s) => this.summary.set(s), error: () => undefined });
    }
  }
}
