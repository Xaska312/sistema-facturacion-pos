import { Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';
import { InlineErrorScope } from '../../core/errors/inline-errors';
import { problemMessage } from '../../core/errors/problem';

/**
 * Aviso "Confirma tu correo" para cuentas sin confirmar (requisito para crear un negocio). Permite reenviar el
 * correo y, si lo confirmó en otra pestaña o en el celular, volver a revisar sin cerrar sesión.
 */
@Component({
  selector: 'app-verify-email-banner',
  imports: [ButtonModule],
  template: `
    @if (auth.user(); as user) {
      @if (!user.emailVerified) {
        <div class="rounded-lg border border-warning bg-warning-soft text-warning-soft-fg p-3 text-sm flex flex-col gap-2" role="status">
          <p>
            <i class="pi pi-envelope mr-1" aria-hidden="true"></i>
            <strong>Confirma tu correo.</strong> Te enviamos un enlace a <strong>{{ user.email }}</strong>; ábrelo para
            poder crear tu negocio. Si no lo ves, revisa la carpeta de spam.
          </p>
          @if (notice()) {
            <p>{{ notice() }}</p>
          }
          <div class="flex flex-wrap gap-2">
            <p-button label="Reenviar correo" icon="pi pi-send" size="small" severity="secondary"
                      [loading]="sending()" (onClick)="resend()" />
            <p-button label="Ya lo confirmé" size="small" [text]="true" [loading]="checking()" (onClick)="check()" />
          </div>
        </div>
      }
    }
  `,
})
export class VerifyEmailBannerComponent {
  protected readonly auth = inject(AuthService);
  private readonly inline = inject(InlineErrorScope);

  protected readonly sending = signal(false);
  protected readonly checking = signal(false);
  protected readonly notice = signal<string | null>(null);

  resend(): void {
    this.sending.set(true);
    this.notice.set(null);
    this.inline.run(this.auth.resendVerification()).subscribe({
      next: () => {
        this.sending.set(false);
        this.notice.set('Listo: te enviamos un correo nuevo. El enlace anterior deja de funcionar.');
      },
      error: (err: unknown) => {
        this.sending.set(false);
        this.notice.set(problemMessage(err));
      },
    });
  }

  check(): void {
    this.checking.set(true);
    this.notice.set(null);
    this.auth.reloadUser().subscribe({
      next: (user) => {
        this.checking.set(false);
        if (!user.emailVerified) {
          this.notice.set('Aún no aparece confirmado. Abre el enlace del correo más reciente.');
        }
      },
      error: () => this.checking.set(false),
    });
  }
}
