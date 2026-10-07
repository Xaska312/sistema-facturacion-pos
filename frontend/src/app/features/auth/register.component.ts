import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';
import { safeReturnUrl } from '../../core/auth/return-url';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, PasswordModule],
  template: `
    <main class="min-h-screen flex items-center justify-center p-4">
      <form [formGroup]="form" (ngSubmit)="submit()"
            class="w-full max-w-sm card p-6 flex flex-col gap-4">
        <h1 class="text-2xl font-semibold text-center">Crear cuenta</h1>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Nombre completo</span>
          <input pInputText formControlName="fullName" autocomplete="name" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Correo</span>
          <input pInputText type="email" formControlName="email" autocomplete="email" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Celular (opcional)</span>
          <input pInputText formControlName="phone" autocomplete="tel" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Contraseña</span>
          <p-password formControlName="password" [toggleMask]="true" autocomplete="new-password"
                      styleClass="w-full" inputStyleClass="w-full"
                      promptLabel="Mínimo 10 caracteres, con letras y números" />
        </label>

        @if (error()) {
          <p class="text-sm text-danger" role="alert">{{ error() }}</p>
        }

        <p-button type="submit" label="Registrarme" [loading]="loading()" [disabled]="form.invalid" styleClass="w-full" />
        <p class="text-sm text-center">
          ¿Ya tienes cuenta? <a routerLink="/login" [queryParams]="returnUrl ? { returnUrl: returnUrl } : {}"
                                class="text-brand hover:underline">Inicia sesión</a>
        </p>
      </form>
    </main>
  `,
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly returnUrl = safeReturnUrl(this.query.get('returnUrl'));

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    email: [this.query.get('email') ?? '', [Validators.required, Validators.email]],
    phone: [''],
    password: ['', [Validators.required, Validators.minLength(10), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
  });

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();
    this.auth.register({ ...value, phone: value.phone || null }).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: 'Cuenta creada',
          detail: `Te enviamos un correo a ${value.email} para confirmarlo. Ya puedes iniciar sesión.`,
          life: 8000,
        });
        void this.router.navigate(['/login'], { queryParams: this.returnUrl ? { returnUrl: this.returnUrl } : {} });
      },
      error: (err: unknown) => {
        this.error.set(problemMessage(err));
        this.loading.set(false);
      },
    });
  }
}
