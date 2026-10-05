import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { AuthService } from '../../core/auth/auth.service';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { MyDayComponent } from '../dashboard/my-day.component';
import { StockAlertsComponent } from '../dashboard/stock-alerts.component';

@Component({
  selector: 'app-home',
  imports: [RouterLink, ButtonModule, SkeletonModule, HasPermissionDirective, PageHeaderComponent, DashboardComponent,
    MyDayComponent, StockAlertsComponent],
  template: `
    <app-page-header [title]="'Hola, ' + (auth.user()?.fullName ?? '')"
                     [description]="'Estás trabajando en ' + (auth.currentTenant()?.tradeName ?? 'tu negocio') + '.'">
      <a *hasPermission="'sales:create'" pButton routerLink="/pos" label="Vender" icon="pi pi-shopping-cart"></a>
      <a *hasPermission="'cash:operate'" pButton routerLink="/app/caja" label="Mi caja" icon="pi pi-wallet"
         severity="secondary" [outlined]="true"></a>
      <a *hasPermission="'reports:read'" pButton routerLink="/app/reportes" label="Reportes" icon="pi pi-chart-bar"
         severity="secondary" [outlined]="true"></a>
    </app-page-header>

    <!-- Las gráficas (Chart.js) se cargan aparte, después de pintar la página. -->
    @if (auth.hasPermission('reports:read')) {
      @defer {
        <app-dashboard />
      } @placeholder (minimum 200ms) {
        <div class="card p-4 mb-4"><p-skeleton height="20rem" /></div>
      }
    } @else {
      <div class="flex flex-col gap-4 mb-4">
        @if (auth.hasPermission('sales:read')) {
          @defer {
            <app-my-day />
          } @placeholder (minimum 200ms) {
            <div class="card p-4"><p-skeleton height="6rem" /></div>
          }
        }
        <app-stock-alerts class="max-w-xl" />
      </div>
    }

    <section class="card p-4 mt-4">
      <h2 class="font-medium mb-2">Tus permisos en este negocio</h2>
      <ul class="flex flex-wrap gap-2">
        @for (permission of permissions(); track permission) {
          <li class="text-xs font-mono bg-surface-alt rounded px-2 py-1">{{ permission }}</li>
        }
      </ul>
    </section>
  `,
})
export class HomeComponent {
  protected readonly auth = inject(AuthService);

  protected permissions(): string[] {
    return [...this.auth.permissions()].sort();
  }
}
