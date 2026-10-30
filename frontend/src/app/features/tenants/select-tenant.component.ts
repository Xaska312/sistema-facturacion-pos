import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TenantSummary } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { isTenantPage, safeReturnUrl } from '../../core/auth/return-url';
import { VerifyEmailBannerComponent } from '../auth/verify-email-banner.component';
import { suspendedMessage } from '../platform/platform-labels';
import { AuthLayoutComponent } from '../../shared/layout/auth-layout.component';

const STATUS_LABEL: Record<TenantSummary['status'], string> = {
  ACTIVE: 'Activo',
  PROVISIONING: 'Creando…',
  SUSPENDED: 'Suspendido',
  FAILED: 'Falló la creación',
  // No aparece: un negocio eliminado sale de la lista de sus miembros (decisión 262).
  DELETED: 'Eliminado',
};

@Component({
  selector: 'app-select-tenant',
  imports: [RouterLink, ButtonModule, VerifyEmailBannerComponent, AuthLayoutComponent],
  template: `
    <app-auth-layout width="lg">
      <section class="flex flex-col gap-4">
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">Hola, {{ auth.user()?.fullName }}</h1>
            <p class="text-muted mt-1">Elige el negocio con el que vas a trabajar</p>
          </div>
          <p-button label="Salir" icon="pi pi-sign-out" [text]="true" severity="secondary" (onClick)="logout()" />
        </header>

        <app-verify-email-banner />

        <ul class="flex flex-col gap-3">
          @for (tenant of auth.tenants(); track tenant.id) {
            <li class="card p-4 sm:p-5 flex items-center gap-4" [class.business--active]="tenant.status === 'ACTIVE'">
              <span class="business-mark" aria-hidden="true">{{ initial(tenant) }}</span>
              <div class="min-w-0 flex-1">
                <p class="font-bold text-lg leading-tight truncate">{{ tenant.tradeName }}</p>
                <p class="text-sm text-muted truncate">{{ tenant.legalName }} · {{ statusLabel[tenant.status] }}</p>
                @if (tenant.status === 'SUSPENDED') {
                  <p class="text-xs text-danger mt-1">{{ suspended(tenant) }}</p>
                }
              </div>
              @if (tenant.status === 'ACTIVE') {
                <p-button label="Entrar" icon="pi pi-arrow-right" iconPos="right" [loading]="selecting() === tenant.id"
                          (onClick)="select(tenant)" />
              } @else if (tenant.status === 'FAILED' && tenant.owner) {
                <p-button label="Reintentar" severity="warn" [loading]="selecting() === tenant.id" (onClick)="retry(tenant)" />
              }
            </li>
          } @empty {
            <li class="card p-8 text-center text-muted">Aún no perteneces a ningún negocio.</li>
          }
        </ul>

        <div class="grid gap-3 sm:grid-cols-2">
          <a routerLink="/negocios/nuevo" class="new-business">
            <i class="pi pi-plus" aria-hidden="true"></i>
            <span class="font-bold">Crear un negocio</span>
          </a>
          @if (auth.isPlatformAdmin()) {
            <a routerLink="/plataforma" class="new-business new-business--quiet">
              <i class="pi pi-server" aria-hidden="true"></i>
              <span class="font-bold">Consola de plataforma</span>
            </a>
          }
        </div>
      </section>
    </app-auth-layout>
  `,
  styles: `
    .business-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 3rem;
      height: 3rem;
      border-radius: 1rem;
      background: var(--brand-soft);
      color: var(--brand-soft-text);
      font-size: 1.25rem;
      font-weight: 800;
    }
    .business--active { transition: border-color 150ms; }
    .business--active:hover { border-color: var(--brand); }
    .new-business {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.625rem;
      min-height: 3.5rem;
      padding: 0.75rem 1rem;
      border-radius: 1.25rem;
      border: 1.5px dashed var(--field-border);
      color: var(--brand);
      text-decoration: none;
      transition: border-color 150ms, background-color 150ms;
    }
    .new-business:hover { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-soft-text); }
    .new-business--quiet { color: var(--text-muted); }
  `,
})
export class SelectTenantComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly selecting = signal<string | null>(null);
  /** Página del negocio que se pidió antes de elegirlo (QA UI-11). */
  private readonly returnUrl = safeReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  ngOnInit(): void {
    this.auth.loadTenants().subscribe();
  }

  select(tenant: TenantSummary): void {
    this.selecting.set(tenant.id);
    this.auth.selectTenant(tenant.id).subscribe({
      next: () => void this.router.navigateByUrl(isTenantPage(this.returnUrl) ? this.returnUrl : '/app'),
      error: () => this.selecting.set(null),
    });
  }

  retry(tenant: TenantSummary): void {
    this.selecting.set(tenant.id);
    this.auth.retryProvisioning(tenant.id).subscribe({
      next: () => this.selecting.set(null),
      error: () => this.selecting.set(null),
    });
  }

  /** Letra del nombre del negocio para su baldosa. */
  protected initial(tenant: TenantSummary): string {
    return tenant.tradeName.trim().charAt(0).toUpperCase() || '·';
  }

  protected suspended(tenant: TenantSummary): string {
    return suspendedMessage(tenant.suspensionReason, tenant.closedByOwner);
  }

  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
