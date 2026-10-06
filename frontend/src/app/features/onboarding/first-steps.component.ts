import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { AccessApi } from '../../core/api/access.api';
import { CashApi } from '../../core/api/cash.api';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { SalesApi } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import {
  FirstStep,
  FirstStepCounts,
  buildFirstSteps,
  dismissFirstSteps,
  firstStepsKey,
  firstStepsProgress,
  isFirstStepsDismissed,
  restoreFirstSteps,
} from './first-steps';

/**
 * Primeros pasos del negocio (para el dueño o quien administra los ajustes): progreso calculado con datos reales y
 * un botón por paso. Se puede ocultar (se recuerda en este equipo) y volver a mostrar.
 */
@Component({
  selector: 'app-first-steps',
  imports: [RouterLink, ButtonModule, SkeletonModule],
  template: `
    @if (eligible) {
      @if (dismissed()) {
        <button type="button" class="text-sm text-brand hover:underline min-h-11" (click)="show()">
          Mostrar los primeros pasos
        </button>
      } @else {
      @if (steps(); as list) {
        @let p = progress();
        <section class="card p-4 md:p-5" aria-labelledby="first-steps-title">
          <header class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="first-steps-title" class="text-lg font-semibold">
                {{ p.complete ? '¡Tu negocio está listo para vender!' : 'Primeros pasos' }}
              </h2>
              <p class="text-sm text-muted">
                {{ p.complete ? 'Completaste lo necesario. Puedes ocultar esta lista.' : 'Sigue estos pasos para llegar a tu primera venta.' }}
              </p>
            </div>
            <p-button label="Ocultar lista" icon="pi pi-eye-slash" [text]="true" severity="secondary" size="small"
                      (onClick)="dismiss()" />
          </header>

          <div class="mt-3 flex items-center gap-3">
            <div class="flex-1 h-2 rounded-full bg-surface-alt overflow-hidden" role="progressbar" aria-label="Avance de los primeros pasos"
                 aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="p.percent"
                 [attr.aria-valuetext]="p.done + ' de ' + p.total + ' pasos'">
              <div class="h-full bg-brand transition-[width] duration-200" [style.width.%]="p.percent"></div>
            </div>
            <span class="text-sm font-medium whitespace-nowrap">{{ p.done }} de {{ p.total }}</span>
          </div>

          <ol class="mt-4 grid gap-2 md:grid-cols-2">
            @for (step of list; track step.id; let i = $index) {
              <li class="step" [class.step--next]="p.next?.id === step.id" [class.step--done]="step.done">
                <span class="step-mark" aria-hidden="true">
                  @if (step.done) {
                    <i class="pi pi-check"></i>
                  } @else {
                    {{ i + 1 }}
                  }
                </span>
                <div class="flex-1 min-w-0">
                  <p class="font-medium">
                    {{ step.title }}
                    <span class="sr-only">{{ step.done ? '(hecho)' : '(pendiente)' }}</span>
                    @if (step.optional) {
                      <span class="ml-1 text-xs font-normal rounded px-1.5 py-0.5 bg-surface-alt text-muted">Opcional</span>
                    }
                  </p>
                  <p class="text-sm text-muted">{{ step.description }}</p>
                  @if (!step.done && can(step)) {
                    <a pButton [routerLink]="step.route" [label]="step.actionLabel" size="small" class="mt-2"
                       [outlined]="p.next?.id !== step.id" icon="pi pi-arrow-right" iconPos="right"></a>
                  }
                </div>
              </li>
            }
          </ol>
        </section>
      } @else {
        <div class="card p-4" aria-busy="true"><p-skeleton height="9rem" /></div>
      }
      }
    }
  `,
  styles: `
    .step {
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem;
      border-radius: 0.75rem;
      border: 1px solid var(--surface-border);
    }
    .step--next {
      border-color: var(--brand);
      background: var(--brand-soft);
    }
    .step--next .text-muted {
      color: var(--brand-soft-text);
    }
    .step-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 600;
      background: var(--surface-alt);
      color: var(--text-muted);
    }
    .step--done .step-mark {
      background: var(--success-soft);
      color: var(--success-soft-text);
    }
    .step--next .step-mark {
      background: var(--brand);
      color: var(--brand-contrast);
    }
  `,
})
export class FirstStepsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly organization = inject(OrganizationApi);
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);
  private readonly access = inject(AccessApi);
  private readonly cash = inject(CashApi);
  private readonly sales = inject(SalesApi);

  /** El dueño o quien puede cambiar los ajustes del negocio. */
  protected readonly eligible = (this.auth.currentTenant()?.owner ?? false) || this.auth.hasPermission('settings:manage');
  private readonly key = firstStepsKey(this.auth.user()?.id ?? 'anon', this.auth.tenantId() ?? 'none');
  protected readonly dismissed = signal(isFirstStepsDismissed(this.key));
  protected readonly steps = signal<FirstStep[] | null>(null);
  protected readonly progress = computed(() => firstStepsProgress(this.steps() ?? []));

  ngOnInit(): void {
    if (this.eligible && !this.dismissed()) {
      this.load();
    }
  }

  can(step: FirstStep): boolean {
    return this.auth.hasPermission(step.permission);
  }

  dismiss(): void {
    dismissFirstSteps(this.key);
    this.dismissed.set(true);
  }

  show(): void {
    restoreFirstSteps(this.key);
    this.dismissed.set(false);
    if (!this.steps()) {
      this.load();
    }
  }

  private load(): void {
    const has = (permission: string) => this.auth.hasPermission(permission);
    /** Sin permiso o con error, el conteo queda desconocido (el paso se muestra pendiente). */
    const count = (permission: string, request: () => Observable<number>): Observable<number | null> =>
      has(permission) ? request().pipe(catchError(() => of(null))) : of(null);
    const counts: { [K in keyof FirstStepCounts]: Observable<FirstStepCounts[K]> } = {
      branches: count('branches:read', () => this.organization.branches({ page: 0, size: 1 }).pipe(map((p) => p.totalElements))),
      categories: count('products:read', () => this.catalog.categories().pipe(map((list) => list.length))),
      products: count('products:read', () => this.catalog.products({ page: 0, size: 1 }).pipe(map((p) => p.totalElements))),
      stockDocuments: count('inventory:read', () => this.inventory.documents(null, null, 0, 1).pipe(map((p) => p.totalElements))),
      team: count('members:read', () => forkJoin([
        this.access.members({ page: 0, size: 1 }, null),
        this.access.invitations({ page: 0, size: 1 }, true),
      ]).pipe(map(([members, invitations]) => members.totalElements + invitations.totalElements))),
      cashSessions: count('cash:read', () => this.cash.sessions({ status: null, cashRegisterId: null, from: null, to: null }, 0, 1)
        .pipe(map((p) => p.totalElements))),
      sales: count('sales:read', () => this.sales.search({ from: null, to: null, status: null, search: null, cashSessionId: null }, 0, 1)
        .pipe(map((p) => p.totalElements))),
    };
    forkJoin(counts).subscribe((result) => this.steps.set(buildFirstSteps(result)));
  }
}
