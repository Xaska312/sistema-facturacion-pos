import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../../core/auth/auth.service';
import { InlineErrorScope } from '../../core/errors/inline-errors';
import { problemMessage } from '../../core/errors/problem';

/** "¿Olvidaste tu contraseña?": pide el enlace para crear una nueva (la respuesta no revela si el correo existe). */
@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule],
  template: `
    <main class="min-h-screen flex items-center justify-center p-4">
      <section class="w-full max-w-sm card p-6 flex flex-col gap-4">
        <h1 class="text-2xl font-semibold text-center">Recuperar contraseña</h1>
        @if (sentTo(); as email) {
          <p>
            Si hay una cuenta con <strong>{{ email }}</strong>, te enviamos un enlace para crear una contraseña nueva.
            Vence en 1 hora.
          </p>
          <p class="text-sm text-muted">¿No llega? Revisa la carpeta de spam o pide otro en un minuto.</p>
          <a routerLink="/login" class="text-center text-brand hover:underline">Volver a iniciar sesión</a>
        } @else {
          <p class="text-center text-muted -mt-2">Te enviaremos un enlace a tu correo</p>
          <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Correo</span>
              <input pInputText type="email" formControlName="email" autocomplete="username" />
            </label>
            @if (error()) {
              <p class="text-sm text-danger" role="alert">{{ error() }}</p>
            }
            <p-button type="submit" label="Enviar enlace" [loading]="loading()" [disabled]="form.invalid"
                      styleClass="w-full" />
          </form>
          <a routerLink="/login" class="text-sm text-center text-brand hover:underline">Volver a iniciar sesión</a>
        }
      </section>
    </main>
  `,
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly inline = inject(InlineErrorScope);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly sentTo = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: [inject(ActivatedRoute).snapshot.queryParamMap.get('email') ?? '', [Validators.required, Validators.email]],
  });

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    const email = this.form.getRawValue().email.trim();
    this.loading.set(true);
    this.error.set(null);
    this.inline.run(this.auth.requestPasswordReset(email)).subscribe({
      next: () => {
        this.loading.set(false);
        this.sentTo.set(email);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(problemMessage(err));
      },
    });
  }
}
