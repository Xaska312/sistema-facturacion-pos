import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';
import { safeReturnUrl } from '../../core/auth/return-url';
import { problemMessage } from '../../core/errors/problem';
import { LegalService } from '../../core/legal/legal.service';
import { LEGAL_OWNER } from './legal-content';
import { AuthLayoutComponent } from '../../shared/layout/auth-layout.component';

/**
 * "Aceptar términos" (decisión 250): sale a quien entra sin haber aceptado las versiones vigentes (cuentas creadas
 * antes de pedirlas o cuando cambia un texto). Sin aceptar solo puede leerlos o salir.
 */
@Component({
  selector: 'app-accept-legal',
  imports: [RouterLink, ButtonModule, AuthLayoutComponent],
  template: `
    <app-auth-layout width="md">
      <section class="card p-6 sm:p-8 flex flex-col gap-4" aria-labelledby="accept-title">
        <h1 id="accept-title" class="text-2xl sm:text-3xl font-extrabold tracking-tight">Antes de seguir</h1>
        <p class="text-sm leading-relaxed">
          Para usar XASKA POS necesitamos que aceptes los
          <a routerLink="/terminos" target="_blank" class="text-brand hover:underline">Términos y Condiciones</a>
          y autorices el tratamiento de tus datos según la
          <a routerLink="/privacidad" target="_blank" class="text-brand hover:underline">Política de Tratamiento de Datos</a>.
          Puedes conocer, actualizar o pedir que se borren tus datos escribiendo a {{ owner.email }}.
        </p>

        @if (error()) {
          <p class="text-sm text-danger" role="alert">{{ error() }}</p>
        }

        <p-button label="Acepto y continúo" icon="pi pi-check" styleClass="w-full" [loading]="saving()"
                  (onClick)="accept()" />
        <p-button label="Salir" severity="secondary" [text]="true" styleClass="w-full" [disabled]="saving()"
                  (onClick)="logout()" />
      </section>
    </app-auth-layout>
  `,
})
export class AcceptLegalComponent {
  private readonly legal = inject(LegalService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly returnUrl = safeReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  protected readonly owner = LEGAL_OWNER;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected accept(): void {
    this.saving.set(true);
    this.error.set(null);
    this.legal.accept().subscribe({
      next: () => void this.router.navigateByUrl(this.returnUrl ?? (this.auth.hasTenant() ? '/app' : '/negocios')),
      error: (err: unknown) => {
        this.error.set(problemMessage(err));
        this.saving.set(false);
      },
    });
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
