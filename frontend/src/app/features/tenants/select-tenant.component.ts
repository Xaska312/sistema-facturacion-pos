import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TenantSummary } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { isTenantPage, safeReturnUrl } from '../../core/auth/return-url';
import { VerifyEmailBannerComponent } from '../auth/verify-email-banner.component';
import { suspendedMessage } from '../platform/platform-labels';

const STATUS_LABEL: Record<TenantSummary['status'], string> = {
  ACTIVE: 'Activo',
  PROVISIONING: 'Creando…',
  SUSPENDED: 'Suspendido',
  FAILED: 'Falló la creación',
};

@Component({
  selector: 'app-select-tenant',
  imports: [RouterLink, ButtonModule, VerifyEmailBannerComponent],
  template: `
    <main class="min-h-screen flex items-center justify-center p-4">
      <section class="w-full max-w-lg card p-6 flex flex-col gap-4">
        <header class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold">Hola, {{ auth.user()?.fullName }}</h1>
            <p class="text-muted text-sm">Elige el negocio con el que vas a trabajar</p>
          </div>
          <p-button label="Salir" [text]="true" severity="secondary" (onClick)="logout()" />
        </header>

        <app-verify-email-banner />

        @for (tenant of auth.tenants(); track tenant.id) {
          <div class="border rounded-lg p-4 flex items-center justify-between gap-3">
            <div>
              <p class="font-medium">{{ tenant.tradeName }}</p>
              <p class="text-xs text-muted">{{ tenant.legalName }} · {{ statusLabel[tenant.status] }}</p>
              @if (tenant.status === 'SUSPENDED') {
                <p class="text-xs text-danger mt-1">{{ suspended(tenant) }}</p>
              }
            </div>
            @if (tenant.status === 'ACTIVE') {
              <p-button label="Entrar" [loading]="selecting() === tenant.id" (onClick)="select(tenant)" />
            } @else if (tenant.status === 'FAILED' && tenant.owner) {
              <p-button label="Reintentar" severity="warn" [loading]="selecting() === tenant.id" (onClick)="retry(tenant)" />
            }
          </div>
        } @empty {
          <p class="text-muted text-center py-6">Aún no perteneces a ningún negocio.</p>
        }

        <a routerLink="/negocios/nuevo" class="text-center text-brand hover:underline">+ Crear un negocio</a>
        @if (auth.isPlatformAdmin()) {
          <a routerLink="/plataforma" class="text-center text-sm text-muted hover:text-fg hover:underline">
            <i class="pi pi-server text-xs mr-1" aria-hidden="true"></i>Consola de plataforma
          </a>
        }
      </section>
    </main>
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

  protected suspended(tenant: TenantSummary): string {
    return suspendedMessage(tenant.suspensionReason, tenant.closedByOwner);
  }

  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
