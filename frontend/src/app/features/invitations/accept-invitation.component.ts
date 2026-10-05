import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { AccessApi } from '../../core/api/access.api';
import { InvitationPreview } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';

/**
 * Página pública del enlace de invitación. Si no hay sesión, ofrece iniciar sesión o registrarse
 * y vuelve aquí; con sesión, permite aceptar y entra al negocio.
 */
@Component({
  selector: 'app-accept-invitation',
  imports: [RouterLink, DatePipe, ButtonModule],
  template: `
    <main class="min-h-screen flex items-center justify-center p-4">
      <section class="w-full max-w-md card p-6 flex flex-col gap-4">
        @if (error()) {
          <h1 class="text-xl font-semibold">Invitación no disponible</h1>
          <p class="text-muted">{{ error() }}</p>
          <a routerLink="/login" class="text-brand hover:underline">Ir a iniciar sesión</a>
        } @else {
          <!-- Angular 19 solo permite "as" en el primer bloque del @if -->
          @if (preview(); as p) {
            <h1 class="text-xl font-semibold">Te invitaron a {{ p.tenantName }}</h1>
            <p class="text-muted">
              {{ p.invitedByName ?? 'Un administrador' }} te invitó a trabajar en <strong>{{ p.tenantName }}</strong>
              con el correo <strong>{{ p.email }}</strong>.
            </p>
            @if (p.status !== 'PENDING') {
              <p class="text-warning">Esta invitación ya fue {{ p.status === 'ACCEPTED' ? 'usada' : 'revocada' }}.</p>
            } @else if (p.expired) {
              <p class="text-warning">Esta invitación venció el {{ p.expiresAt | date: 'medium' }}. Pide un enlace nuevo.</p>
            } @else if (!auth.isAuthenticated()) {
              <p class="text-sm text-muted">Para aceptarla, inicia sesión o crea tu cuenta con ese correo.</p>
              <div class="flex gap-2">
                <a routerLink="/login" [queryParams]="{ returnUrl: here() }" class="flex-1">
                  <p-button label="Iniciar sesión" styleClass="w-full" />
                </a>
                <a routerLink="/registro" [queryParams]="{ returnUrl: here(), email: p.email }" class="flex-1">
                  <p-button label="Crear cuenta" severity="secondary" styleClass="w-full" />
                </a>
              </div>
            } @else if (wrongAccount()) {
              <p class="text-warning">
                Iniciaste sesión como {{ auth.user()?.email }}. Esta invitación es para {{ p.email }}.
              </p>
              <p-button label="Cambiar de cuenta" severity="secondary" (onClick)="switchAccount()" />
            } @else {
              <p-button label="Aceptar invitación" [loading]="accepting()" (onClick)="accept()" />
            }
          } @else {
            <p class="text-muted">Cargando invitación…</p>
          }
        }
      </section>
    </main>
  `,
})
export class AcceptInvitationComponent implements OnInit {
  /** Parámetro de ruta :token (withComponentInputBinding). */
  readonly token = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly api = inject(AccessApi);
  private readonly router = inject(Router);

  protected readonly preview = signal<InvitationPreview | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly accepting = signal(false);
  protected readonly here = computed(() => `/invitacion/${encodeURIComponent(this.token())}`);
  protected readonly wrongAccount = computed(() => {
    const email = this.auth.user()?.email;
    const invited = this.preview()?.email;
    return !!email && !!invited && email.toLowerCase() !== invited.toLowerCase();
  });

  ngOnInit(): void {
    this.api.previewInvitation(this.token()).subscribe({
      next: (preview) => this.preview.set(preview),
      error: (err: unknown) => this.error.set(problemMessage(err)),
    });
  }

  accept(): void {
    this.accepting.set(true);
    this.api.acceptInvitation(this.token()).subscribe({
      next: (accepted) =>
        this.auth.selectTenant(accepted.tenantId)
          .pipe(switchMap(() => this.auth.loadTenants()))
          .subscribe({
            next: () => void this.router.navigate(['/app']),
            error: () => void this.router.navigate(['/negocios']),
          }),
      error: () => this.accepting.set(false),
    });
  }

  switchAccount(): void {
    this.auth.logout().subscribe(() =>
      void this.router.navigate(['/login'], { queryParams: { returnUrl: this.here() } }));
  }
}
