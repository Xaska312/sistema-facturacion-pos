import { Component, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/auth/auth.service';
import { InlineErrorScope } from '../../core/errors/inline-errors';
import { problemMessage } from '../../core/errors/problem';

/** Las dos contraseñas deben coincidir. */
export function samePasswords(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string | undefined;
  const repeat = group.get('repeat')?.value as string | undefined;
  return password && repeat && password !== repeat ? { mismatch: true } : null;
}

/** Página del enlace "Crear una contraseña nueva" ({@code /restablecer-clave?token=…}). */
@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, PasswordModule],
  template: `
    <main class="min-h-screen flex items-center justify-center p-4">
      <form [formGroup]="form" (ngSubmit)="submit()" class="w-full max-w-sm card p-6 flex flex-col gap-4">
        <h1 class="text-2xl font-semibold text-center">Contraseña nueva</h1>
        @if (!token()) {
          <p class="text-danger" role="alert">El enlace está incompleto. Ábrelo desde el correo o pide uno nuevo.</p>
        } @else {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Contraseña nueva</span>
            <p-password formControlName="password" [toggleMask]="true" autocomplete="new-password"
                        styleClass="w-full" inputStyleClass="w-full"
                        promptLabel="Mínimo 10 caracteres, con letras y números" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Repítela</span>
            <p-password formControlName="repeat" [feedback]="false" [toggleMask]="true" autocomplete="new-password"
                        styleClass="w-full" inputStyleClass="w-full" />
          </label>
          @if (form.hasError('mismatch')) {
            <p class="text-sm text-danger">Las contraseñas no coinciden.</p>
          }
          @if (error()) {
            <p class="text-sm text-danger" role="alert">{{ error() }}</p>
          }
          <p class="text-xs text-muted">Al guardarla se cierran las sesiones abiertas en todos tus equipos.</p>
          <p-button type="submit" label="Guardar contraseña" [loading]="loading()" [disabled]="form.invalid"
                    styleClass="w-full" />
        }
        <a routerLink="/recuperar-clave" class="text-sm text-center text-brand hover:underline">Pedir un enlace nuevo</a>
      </form>
    </main>
  `,
})
export class ResetPasswordComponent {
  /** Query param ?token= (withComponentInputBinding). */
  readonly token = input<string | undefined>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly inline = inject(InlineErrorScope);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(10), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
      repeat: ['', Validators.required],
    },
    { validators: samePasswords },
  );

  submit(): void {
    const token = this.token()?.trim();
    if (this.form.invalid || !token) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.inline.run(this.auth.confirmPasswordReset(token, this.form.getRawValue().password)).subscribe({
      next: () => {
        // El backend cerró todas las sesiones de la cuenta (también la de esta pestaña, si había).
        this.auth.clear();
        this.messages.add({
          severity: 'success',
          summary: 'Contraseña actualizada',
          detail: 'Inicia sesión con tu contraseña nueva.',
        });
        void this.router.navigate(['/login']);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(problemMessage(err));
      },
    });
  }
}
