import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StockAlert } from '../../core/api/api.models';
import { InventoryApi } from '../../core/api/inventory.api';
import { AuthService } from '../../core/auth/auth.service';
import { formatQuantity } from '../../shared/money';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <h1 class="text-2xl font-semibold mb-2">Bienvenido, {{ auth.user()?.fullName }}</h1>
    <p class="text-slate-600 mb-6">
      Estás trabajando en <strong>{{ auth.currentTenant()?.tradeName ?? 'tu negocio' }}</strong>.
      El panel con ventas llega en la Fase 6.
    </p>

    @if (alerts().length > 0) {
      <section class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <h2 class="font-medium text-amber-900">Alertas de existencias</h2>
        <p class="text-sm text-amber-900 mb-2">{{ alerts().length }} producto(s) en o por debajo del mínimo.</p>
        <ul class="text-sm text-amber-900">
          @for (a of alerts().slice(0, 5); track a.branchId + a.productId) {
            <li>{{ a.name }}: {{ q(a.quantity) }} {{ a.unitCode }} (mín. {{ q(a.minStock) }}) · {{ a.branchName }}</li>
          }
        </ul>
        <a routerLink="/app/inventario" class="text-sm text-blue-700 hover:underline">Ver existencias</a>
      </section>
    }

    <section class="bg-white rounded-xl shadow p-4">
      <h2 class="font-medium mb-2">Tus permisos en este negocio</h2>
      <ul class="flex flex-wrap gap-2">
        @for (permission of permissions(); track permission) {
          <li class="text-xs font-mono bg-slate-100 rounded px-2 py-1">{{ permission }}</li>
        }
      </ul>
    </section>
  `,
})
export class HomeComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly inventory = inject(InventoryApi);
  protected readonly alerts = signal<StockAlert[]>([]);
  protected readonly q = formatQuantity;

  ngOnInit(): void {
    if (this.auth.hasPermission('inventory:read')) {
      this.inventory.alerts(null).subscribe((list) => this.alerts.set(list));
    }
  }

  protected permissions(): string[] {
    return [...this.auth.permissions()].sort();
  }
}
