import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-home',
  template: `
    <h1 class="text-2xl font-semibold mb-2">Bienvenido, {{ auth.user()?.fullName }}</h1>
    <p class="text-slate-600 mb-6">
      Estás trabajando en <strong>{{ auth.currentTenant()?.tradeName ?? 'tu negocio' }}</strong>.
      El panel con ventas y alertas llega en la Fase 6.
    </p>
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
export class HomeComponent {
  protected readonly auth = inject(AuthService);
  protected permissions(): string[] {
    return [...this.auth.permissions()].sort();
  }
}
