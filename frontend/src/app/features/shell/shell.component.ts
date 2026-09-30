import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';
import { visibleMenu } from './menu';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  template: `
    <div class="min-h-screen flex flex-col md:flex-row">
      <aside class="md:w-60 bg-slate-900 text-slate-100 flex md:flex-col">
        <div class="p-4 border-b border-slate-700 hidden md:block">
          <p class="font-semibold">{{ auth.currentTenant()?.tradeName ?? 'Mi negocio' }}</p>
          <p class="text-xs text-slate-400">{{ auth.user()?.fullName }}</p>
        </div>
        <nav class="flex md:flex-col gap-1 p-2 flex-1 overflow-x-auto">
          @for (item of menu(); track item.route) {
            <a [routerLink]="item.route" routerLinkActive="bg-slate-700"
               [routerLinkActiveOptions]="{ exact: item.route === '/app' }"
               class="px-3 py-2 rounded hover:bg-slate-800 whitespace-nowrap">{{ item.label }}</a>
          }
        </nav>
        <div class="p-2 flex md:flex-col gap-1">
          <p-button label="Cambiar negocio" [text]="true" severity="secondary" (onClick)="switchTenant()" />
          <p-button label="Salir" [text]="true" severity="secondary" (onClick)="logout()" />
        </div>
      </aside>
      <main class="flex-1 p-4 md:p-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly menu = computed(() => {
    const permissions = this.auth.permissions();
    return visibleMenu((p) => permissions.has(p));
  });

  switchTenant(): void {
    void this.router.navigate(['/negocios']);
  }

  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
