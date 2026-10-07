import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { InlineErrorScope } from '../../core/errors/inline-errors';
import { problemMessage } from '../../core/errors/problem';

type State = 'checking' | 'done' | 'failed';

/** Página del enlace "Confirmar mi correo" ({@code /verificar-correo?token=…}); funciona con o sin sesión. */
@Component({
  selector: 'app-verify-email',
  imports: [RouterLink],
  template: `
    <main class="min-h-screen flex items-center justify-center p-4">
      <section class="w-full max-w-sm card p-6 flex flex-col gap-4 text-center">
        @switch (state()) {
          @case ('checking') {
            <h1 class="text-xl font-semibold">Confirmando tu correo…</h1>
            <i class="pi pi-spin pi-spinner text-2xl text-muted" aria-hidden="true"></i>
          }
          @case ('done') {
            <i class="pi pi-check-circle text-4xl text-success" aria-hidden="true"></i>
            <h1 class="text-xl font-semibold">¡Correo confirmado!</h1>
            @if (auth.isAuthenticated()) {
              <p class="text-muted">Ya puedes crear tu negocio.</p>
              <a routerLink="/negocios" class="btn-link">Continuar</a>
            } @else {
              <p class="text-muted">Inicia sesión para crear tu negocio.</p>
              <a routerLink="/login" class="btn-link">Iniciar sesión</a>
            }
          }
          @case ('failed') {
            <i class="pi pi-times-circle text-4xl text-danger" aria-hidden="true"></i>
            <h1 class="text-xl font-semibold">No pudimos confirmar tu correo</h1>
            <p class="text-muted">{{ error() }}</p>
            <p class="text-sm text-muted">
              @if (auth.isAuthenticated()) {
                Pide un enlace nuevo con "Reenviar correo" en
                <a routerLink="/negocios" class="text-brand hover:underline">tus negocios</a>.
              } @else {
                <a routerLink="/login" class="text-brand hover:underline">Inicia sesión</a> y pide un enlace nuevo con
                "Reenviar correo".
              }
            </p>
          }
        }
      </section>
    </main>
  `,
  styles: `
    .btn-link {
      display: inline-block;
      background: var(--brand);
      color: var(--brand-contrast);
      border-radius: 0.5rem;
      padding: 0.6rem 1rem;
      font-weight: 600;
    }
  `,
})
export class VerifyEmailComponent implements OnInit {
  /** Query param ?token= (withComponentInputBinding). */
  readonly token = input<string | undefined>();

  protected readonly auth = inject(AuthService);
  private readonly inline = inject(InlineErrorScope);

  protected readonly state = signal<State>('checking');
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const token = this.token()?.trim();
    if (!token) {
      this.fail('El enlace está incompleto. Ábrelo desde el correo o cópialo completo.');
      return;
    }
    this.inline.run(this.auth.verifyEmail(token)).subscribe({
      next: () => this.state.set('done'),
      error: (err: unknown) => this.fail(problemMessage(err)),
    });
  }

  private fail(message: string): void {
    this.error.set(message);
    this.state.set('failed');
  }
}
