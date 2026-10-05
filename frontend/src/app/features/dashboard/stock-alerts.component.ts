import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { StockAlert } from '../../core/api/api.models';
import { InventoryApi } from '../../core/api/inventory.api';
import { AuthService } from '../../core/auth/auth.service';
import { formatQuantity } from '../../shared/money';
import { DOCUMENT_ROUTE } from '../inventory/labels';

/** Productos en o por debajo del mínimo, con acceso directo a existencias y a un ajuste. */
@Component({
  selector: 'app-stock-alerts',
  imports: [RouterLink, ButtonModule],
  template: `
    @if (canRead) {
      <section class="card p-4 h-full flex flex-col" aria-labelledby="stock-alerts-title">
        <header class="flex items-center justify-between gap-2 mb-3">
          <h2 id="stock-alerts-title" class="font-semibold flex items-center gap-2">
            <i class="pi pi-exclamation-triangle text-warning" aria-hidden="true"></i>Alertas de existencias
          </h2>
          @if (alerts().length > 0) {
            <span class="rounded-full bg-danger-soft text-danger-soft-fg text-xs font-semibold px-2 py-0.5">
              {{ alerts().length }}
            </span>
          }
        </header>
        @if (alerts().length === 0) {
          <p class="text-sm text-muted flex items-center gap-2">
            <i class="pi pi-check-circle text-success" aria-hidden="true"></i>
            Todo en orden: ningún producto está por debajo del mínimo.
          </p>
        } @else {
          <ul class="divide-y divide-line">
            @for (a of alerts().slice(0, 5); track a.branchId + a.productId) {
              <li class="py-2 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium truncate">{{ a.name }}</p>
                  <p class="text-xs text-muted">{{ a.branchName }} · mínimo {{ q(a.minStock) }} {{ a.unitCode }}</p>
                </div>
                <span class="text-danger font-semibold tabular-nums whitespace-nowrap">{{ q(a.quantity) }} {{ a.unitCode }}</span>
              </li>
            }
          </ul>
          @if (alerts().length > 5) {
            <p class="text-xs text-muted mt-1">Y {{ alerts().length - 5 }} más.</p>
          }
          <div class="mt-auto pt-3 flex flex-wrap gap-2">
            <a pButton routerLink="/app/inventario" label="Ver existencias" icon="pi pi-warehouse" size="small"
               severity="secondary" [outlined]="true"></a>
            @if (canAdjust) {
              <a pButton [routerLink]="['/app/inventario/nuevo', adjustRoute]" label="Hacer un ajuste" icon="pi pi-sliders-h"
                 size="small"></a>
            }
          </div>
        }
      </section>
    }
  `,
})
export class StockAlertsComponent {
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);

  /** Sucursal del filtro (null = todas). */
  readonly branchId = input<string | null>(null);

  protected readonly canRead = this.auth.hasPermission('inventory:read');
  protected readonly canAdjust = this.auth.hasPermission('inventory:adjust');
  protected readonly adjustRoute = DOCUMENT_ROUTE.ADJUSTMENT;
  protected readonly alerts = signal<StockAlert[]>([]);
  protected readonly q = formatQuantity;

  constructor() {
    effect(() => {
      const branchId = this.branchId();
      if (this.canRead) {
        untracked(() => this.inventory.alerts(branchId).subscribe((list) => this.alerts.set(list)));
      }
    });
  }
}
