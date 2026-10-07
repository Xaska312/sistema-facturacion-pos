import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';
import { safeReturnUrl } from '../../core/auth/return-url';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, PasswordModule],
  template: `
    <main class="min-h-screen flex items-center justify-center p-4">
      <form [formGroup]="form" (ngSubmit)="submit()"
            class="w-full max-w-sm card p-6 flex flex-col gap-4">
        <h1 class="text-2xl font-semibold text-center">POS Híbrido</h1>
        <p class="text-center text-muted -mt-2">Inicia sesión para continuar</p>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Correo</span>
          <input pInputText type="email" formControlName="email" autocomplete="username" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Contraseña</span>
          <p-password formControlName="password" [feedback]="false" [toggleMask]="true"
                      autocomplete="current-password" styleClass="w-full" inputStyleClass="w-full" />
        </label>
        <a routerLink="/recuperar-clave" [queryParams]="form.controls.email.valid ? { email: form.controls.email.value } : {}"
           class="text-sm text-brand hover:underline self-end -mt-2">¿Olvidaste tu contraseña?</a>

        @if (error()) {
          <p class="text-sm text-danger" role="alert">{{ error() }}</p>
        }

        <p-button type="submit" label="Ingresar" [loading]="loading()" [disabled]="form.invalid" styleClass="w-full" />

        <p class="text-sm text-center">
          ¿No tienes cuenta? <a routerLink="/registro" [queryParams]="returnUrl ? { returnUrl: returnUrl } : {}"
                                class="text-brand hover:underline">Regístrate</a>
        </p>
      </form>
    </main>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly returnUrl = safeReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => void this.router.navigateByUrl(this.returnUrl ?? '/negocios'),
      error: (err: unknown) => {
        this.error.set(problemMessage(err));
        this.loading.set(false);
      },
    });
  }
}
