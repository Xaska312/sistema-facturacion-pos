import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { MyDayComponent } from '../dashboard/my-day.component';
import { StockAlertsComponent } from '../dashboard/stock-alerts.component';
import { FirstStepsComponent } from '../onboarding/first-steps.component';
import { describeCapabilities, firstName, greeting, quickActions } from './capabilities';

/**
 * Inicio: saludo, accesos rápidos según permisos, primeros pasos (dueño de un negocio nuevo) y tablero o "Mi día".
 * Sin ningún permiso, un aviso para pedir un rol.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, SkeletonModule, PageHeaderComponent, DashboardComponent, MyDayComponent, StockAlertsComponent,
    FirstStepsComponent],
  template: `
    <app-page-header [title]="title" [description]="'Estás en ' + (auth.currentTenant()?.tradeName ?? 'tu negocio') + '.'" />

    @if (actions().length > 0) {
      <nav data-tour="quick-actions" aria-label="Accesos rápidos" class="mb-5">
        <ul class="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          @for (a of actions(); track a.route; let first = $first) {
            <li>
              <a [routerLink]="a.route" class="action-card" [class.action-card--primary]="first">
                <i [class]="a.icon + ' text-xl'" aria-hidden="true"></i>
                <span class="font-semibold">{{ a.label }}</span>
                <span class="text-xs action-hint">{{ a.hint }}</span>
              </a>
            </li>
          }
        </ul>
      </nav>
    }

    <app-first-steps class="block mb-5" />

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

    <!-- La lista "Lo que puedes hacer en este negocio" se quitó (pedido del usuario): solo se avisa si no hay
         ningún permiso, porque entonces el inicio queda vacío. -->
    @if (capabilities().length === 0) {
      <section class="card p-4 mt-4" role="status">
        <p class="text-sm">Aún no tienes permisos en este negocio. Pide a quien lo administra que te asigne un rol.</p>
      </section>
    }
  `,
  styles: `
    .action-card {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      height: 100%;
      min-height: 6rem;
      padding: 1rem;
      border-radius: 0.75rem;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      box-shadow: var(--elevation-card);
      color: var(--text);
      text-decoration: none;
      transition: border-color 150ms, transform 150ms;
    }
    .action-card .pi {
      color: var(--brand);
    }
    .action-card:hover {
      border-color: var(--brand);
    }
    .action-card:active {
      transform: scale(0.98);
    }
    .action-hint {
      color: var(--text-muted);
    }
    .action-card--primary {
      background: var(--brand);
      border-color: var(--brand);
      color: var(--brand-contrast);
    }
    .action-card--primary .pi,
    .action-card--primary .action-hint {
      color: var(--brand-contrast);
    }
    .action-card--primary:hover {
      background: var(--brand-hover);
    }
  `,
})
export class HomeComponent {
  protected readonly auth = inject(AuthService);
  protected readonly title = `${greeting()}${firstName(this.auth.user()?.fullName) ? ', ' + firstName(this.auth.user()?.fullName) : ''}`;
  protected readonly actions = computed(() => quickActions(this.auth.permissions()));
  protected readonly capabilities = computed(() => describeCapabilities(this.auth.permissions()));
}
