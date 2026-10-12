import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CreateTenantRequest } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';
import { VerifyEmailBannerComponent } from '../auth/verify-email-banner.component';
import { slugify } from './slugify';

/** 403 del backend al crear un negocio sin haber confirmado el correo. */
export function isEmailNotVerified(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403
    && (error.error as { code?: unknown } | null)?.code === 'EMAIL_NOT_VERIFIED';
}

function isUnprocessable(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 422;
}

export function isActivationCodeRequired(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 422
    && (error.error as { code?: unknown } | null)?.code === 'ACTIVATION_CODE_REQUIRED';
}

/**
 * Asistente de creación de negocio en dos pasos: datos del negocio y confirmación.
 * En esta versión solo está disponible el tipo RETAIL.
 */
@Component({
  selector: 'app-create-tenant',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, VerifyEmailBannerComponent],
  template: `
    <main class="min-h-screen flex items-center justify-center p-4">
      <section class="w-full max-w-lg card p-6 flex flex-col gap-4">
        <header>
          <p class="text-xs text-muted">Paso {{ step() }} de 2</p>
          <h1 class="text-xl font-semibold">Crear negocio</h1>
        </header>

        <app-verify-email-banner />

        <form [formGroup]="form" class="flex flex-col gap-4">
          @if (step() === 1) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Nombre comercial</span>
              <input pInputText formControlName="tradeName" (input)="suggestSlug()" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Razón social</span>
              <input pInputText formControlName="legalName" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Identificador</span>
              <input pInputText formControlName="slug" (input)="slugTouched = true" />
              <small class="text-muted">Minúsculas, números y "_" (3 a 41). No se puede cambiar después.</small>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Código de activación{{ codeRequired() ? '' : ' (opcional)' }}</span>
              <input pInputText formControlName="activationCode" id="activationCode" maxlength="40" placeholder="XXXX-XXXX-XXXX"
                     (input)="activationCodeError.set(null)"
                     autocomplete="off" [attr.aria-invalid]="activationCodeError() ? true : null" />
              @if (codeRequired()) {
                <small class="text-muted">Es el código que te damos al contratar tu plan o al pedir la prueba gratis. Si no lo tienes, pídelo a soporte.</small>
              } @else {
                <small class="text-muted">Tu primer negocio tiene {{ trialDays() }} días de prueba gratis; para otro negocio necesitas el código que te dimos al comprar tu plan.</small>
              }
              @if (activationCodeError()) {
                <small class="text-danger font-medium">{{ activationCodeError() }}</small>
              }
            </label>
            <div class="rounded-lg bg-surface-alt p-3 text-sm mt-1">
              Tipo de negocio: <strong>Comercio (RETAIL)</strong>
              <span class="text-muted"> — farmacia, restaurante y servicios llegarán después.</span>
            </div>
            <div class="flex justify-between mt-2">
              <a routerLink="/negocios" class="self-center text-sm text-muted hover:underline">Cancelar</a>
              <p-button label="Continuar" [disabled]="form.invalid" (onClick)="step.set(2)" />
            </div>
          } @else {
            <dl class="grid grid-cols-3 gap-2 text-sm">
              <dt class="text-muted">Nombre</dt><dd class="col-span-2">{{ form.value.tradeName }}</dd>
              <dt class="text-muted">Razón social</dt><dd class="col-span-2">{{ form.value.legalName }}</dd>
              <dt class="text-muted">Identificador</dt><dd class="col-span-2 font-mono">{{ form.value.slug }}</dd>
            </dl>
            <p class="text-sm text-muted">
              Se creará tu negocio con una sede principal, una caja y los roles por defecto.
            </p>
            <div class="flex justify-between mt-2">
              <p-button label="Atrás" [text]="true" severity="secondary" (onClick)="step.set(1)" />
              <p-button label="Crear negocio" [loading]="saving()" [disabled]="!verified()" (onClick)="create()" />
            </div>
          }
        </form>
      </section>
    </main>
  `,
})
export class CreateTenantComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  /** Por defecto todo negocio nuevo necesita código; el servidor dice si hay prueba gratis sin él. */
  readonly codeRequired = signal(true);
  readonly trialDays = signal(14);

  readonly step = signal<1 | 2>(1);
  readonly saving = signal(false);
  readonly activationCodeError = signal<string | null>(null);

  /** Sin el correo confirmado el backend no deja crear el negocio (403 EMAIL_NOT_VERIFIED). */
  readonly verified = computed(() => this.auth.user()?.emailVerified !== false);
  slugTouched = false;

  readonly form = inject(FormBuilder).nonNullable.group({
    tradeName: ['', [Validators.required, Validators.maxLength(200)]],
    legalName: ['', [Validators.required, Validators.maxLength(200)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]{2,40}$/)]],
    activationCode: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(40)]],
  });

  constructor() {
    this.http.get<{ activationCodeRequired: boolean; trialDays: number }>('/api/v1/tenants/signup-terms')
      .subscribe({
        next: (terms) => {
          this.codeRequired.set(terms.activationCodeRequired);
          this.trialDays.set(terms.trialDays);
          const code = this.form.controls.activationCode;
          code.setValidators(terms.activationCodeRequired
            ? [Validators.required, Validators.pattern(/\S/), Validators.maxLength(40)] : [Validators.maxLength(40)]);
          code.updateValueAndValidity();
        },
        error: () => undefined,
      });
  }

  suggestSlug(): void {
    if (!this.slugTouched) {
      this.form.controls.slug.setValue(slugify(this.form.controls.tradeName.value));
    }
  }

  create(): void {
    this.saving.set(true);
    this.activationCodeError.set(null);
    const value = this.form.getRawValue();
    const code = value.activationCode.trim();
    const payload: CreateTenantRequest = {
      tradeName: value.tradeName,
      legalName: value.legalName,
      slug: value.slug,
      businessType: 'RETAIL',
      ...(code ? { activationCode: code } : {}),
    };

    this.auth.createTenant(payload).subscribe({
      next: (tenant) =>
        this.auth.selectTenant(tenant.id).subscribe({
          next: () => void this.router.navigate(['/app']),
          error: () => void this.router.navigate(['/negocios']),
        }),
      error: (err: unknown) => {
        this.saving.set(false);
        if (isEmailNotVerified(err)) {
          // La sesión decía "confirmado" pero el servidor no: refresca la cuenta para mostrar el aviso.
          this.auth.reloadUser().subscribe();
          return;
        }
        if (isActivationCodeRequired(err) || (code !== '' && isUnprocessable(err))) {
          // Sin prueba gratis disponible o código no válido: vuelve al paso 1 con el aviso junto al código (fase 8b).
          this.activationCodeError.set(problemMessage(err));
          this.step.set(1);
          setTimeout(() => document.getElementById('activationCode')?.focus());
          return;
        }
        this.step.set(1);
      },
    });
  }
}
