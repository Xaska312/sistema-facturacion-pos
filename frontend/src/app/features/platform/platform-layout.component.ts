import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Consola de plataforma (solo administradores): negocios de todos los dueños y eventos de seguridad. No entra a
 * los datos de ningún negocio. Fuera del shell de negocio: funciona con la sesión de plataforma.
 */
@Component({
  selector: 'app-platform-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  template: `
    <div class="min-h-screen bg-ground">
      <header class="bg-surface border-b border-line">
        <div class="max-w-6xl mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div class="flex items-center gap-2">
            <i class="pi pi-server text-brand" aria-hidden="true"></i>
            <span class="font-semibold">Consola de plataforma</span>
          </div>
          <nav aria-label="Consola de plataforma" class="flex gap-1 text-sm">
            <a routerLink="negocios" routerLinkActive="bg-brand-soft text-brand-soft-fg" ariaCurrentWhenActive="page"
               class="px-3 py-1.5 rounded-md hover:bg-surface-alt">Negocios</a>
            <a routerLink="seguridad" routerLinkActive="bg-brand-soft text-brand-soft-fg" ariaCurrentWhenActive="page"
               class="px-3 py-1.5 rounded-md hover:bg-surface-alt">Eventos de seguridad</a>
          </nav>
          <div class="ml-auto flex items-center gap-2">
            <span class="text-sm text-muted hidden sm:inline">{{ auth.user()?.email }}</span>
            <p-button label="Mis negocios" icon="pi pi-arrow-left" severity="secondary" [text]="true"
                      (onClick)="back()" />
          </div>
        </div>
      </header>
      <main class="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class PlatformLayoutComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  back(): void {
    void this.router.navigate(['/negocios']);
  }
}
