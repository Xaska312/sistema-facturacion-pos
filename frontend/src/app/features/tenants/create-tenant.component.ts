import { clearReferral, normalizeReferral, readReferral } from '../billing/referral-code';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { ButtonComponent } from '../../shared/ui/button.component';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { BusinessType, CreateTenantRequest } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';
import { VerifyEmailBannerComponent } from '../auth/verify-email-banner.component';
import { slugify } from './slugify';
import { AuthLayoutComponent } from '../../shared/layout/auth-layout.component';
import { businessTypeInfo } from '../../shared/business-types';
import { BusinessTypePickerComponent } from '../../shared/business-type-picker.component';
import { BillingApi, BillingPlan } from '../../core/api/billing.api';
import { formatCop } from '../../shared/money';
import { StartPlan, clearStartPlan, readStartPlan, rememberStartPlan } from '../billing/start-plan';

/** 403 del backend al crear un negocio sin haber confirmado el correo. */
export function isEmailNotVerified(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403
    && (error.error as { code?: unknown } | null)?.code === 'EMAIL_NOT_VERIFIED';
}

function isUnprocessable(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 422;
}

/** El plan elegido en "Planes y precios": de la dirección (con sesión) o recordado desde el registro. */
function startPlanFrom(query: ParamMap): StartPlan | null {
  rememberStartPlan(query.get('plan'), query.get('ciclo'));
  return readStartPlan();
}

export function isActivationCodeRequired(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 422
    && (error.error as { code?: unknown } | null)?.code === 'ACTIVATION_CODE_REQUIRED';
}

/**
 * Asistente de creación de negocio en dos pasos: datos del negocio y confirmación. El tipo (Fase 12a, decisión 267)
 * se elige aquí: Comercio, Servicios, Restaurante o Droguería (decisión 287). Se cambia después en Ajustes.
 */
@Component({
  selector: 'app-create-tenant',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, AppInputDirective, VerifyEmailBannerComponent,
    AuthLayoutComponent, BusinessTypePickerComponent],
  styles: `
    .start { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.75rem 0.875rem; border-radius: 0.875rem;
      border: 1.5px solid var(--color-line); cursor: pointer; }
    .start input { margin-top: 0.25rem; }
    .start-on { border-color: var(--aska); background: var(--aska-soft); }
  `,
  template: `
    <app-auth-layout width="lg">
      <section class="card p-6 sm:p-8 flex flex-col gap-4">
        <header>
          <p class="text-xs font-bold uppercase tracking-wider text-brand">Paso {{ step() }} de 2</p>
          <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">Crear negocio</h1>
        </header>

        <app-verify-email-banner />

        <form [formGroup]="form" class="flex flex-col gap-4">
          @if (step() === 1) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Nombre comercial</span>
              <input appInput formControlName="tradeName" (input)="suggestSlug()" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Razón social</span>
              <input appInput formControlName="legalName" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Identificador</span>
              <input appInput formControlName="slug" (input)="slugTouched = true" />
              <small class="text-muted">Minúsculas, números y "_" (3 a 41). No se puede cambiar después.</small>
            </label>
            <!-- Cómo empezar (decisión 303): prueba gratis, pagar ya con Bre-B o con un código de activación. -->
            <fieldset class="flex flex-col gap-2">
              <legend class="text-sm font-medium mb-1">¿Cómo quieres empezar?</legend>
              @if (trialAvailable()) {
                <label class="start" [class.start-on]="mode() === 'trial'">
                  <input type="radio" name="start" [checked]="mode() === 'trial'" (change)="setMode('trial')" />
                  <span><span class="block font-semibold">Probar gratis {{ trialDays() }} días</span>
                    <span class="block text-xs text-muted">Con todo incluido. Pagas después solo si te sirve.</span></span>
                </label>
              }
              <label class="start" [class.start-on]="mode() === 'pay'">
                <input type="radio" name="start" [checked]="mode() === 'pay'" (change)="setMode('pay')" />
                <span><span class="block font-semibold">Pagar ya con Bre-B</span>
                  <span class="block text-xs text-muted">Eliges tu plan y pagas desde la app de tu banco.
                    @if (trialAvailable()) { Mientras lo aprobamos, usas la prueba gratis. } @else { Lo activamos al aprobar tu pago. }</span></span>
              </label>
              <label class="start" [class.start-on]="mode() === 'code'">
                <input type="radio" name="start" [checked]="mode() === 'code'" (change)="setMode('code')" />
                <span><span class="block font-semibold">Tengo un código de activación</span>
                  <span class="block text-xs text-muted">El que te dimos al contratar tu plan.</span></span>
              </label>
            </fieldset>
            @if (mode() === 'pay') {
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium">Plan</span>
                <select class="border border-line rounded-[10px] px-3 min-h-11 bg-surface" [value]="payPlan()"
                        (change)="payPlan.set($any($event.target).value)">
                  @for (p of plans(); track p.code) {
                    <option [value]="p.code">{{ p.name }} · {{ cop(p.monthlyPrice) }}/mes · {{ cop(p.annualPrice) }}/año</option>
                  }
                </select>
                <small class="text-muted">Al crear el negocio te llevamos a pagar; ahí eliges mensual o anual y si agregas XASKA IA.
                  <a routerLink="/precios" class="underline">Ver qué incluye cada plan</a></small>
              </label>
            }
            @if (mode() === 'code') {
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium">Código de activación</span>
                <input appInput formControlName="activationCode" id="activationCode" maxlength="40" placeholder="XXXX-XXXX-XXXX"
                       (input)="activationCodeError.set(null)"
                       autocomplete="off" [attr.aria-invalid]="activationCodeError() ? true : null" />
              </label>
            }
            @if (activationCodeError()) {
              <small class="text-danger font-medium" id="start-error">{{ activationCodeError() }}</small>
            }
            <!-- Decisión 312: código de invitación (llega en el enlace; se puede escribir). -->
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Código de invitación <span class="text-muted font-normal">(opcional)</span></span>
              <input appInput formControlName="referralCode" id="referralCode" maxlength="20" placeholder="ESQUIN-7KQ"
                     class="uppercase" autocomplete="off" (input)="referralError.set(null)"
                     [attr.aria-invalid]="referralError() ? true : null" />
              @if (referralError()) {
                <small class="text-danger font-medium">{{ referralError() }}</small>
              } @else if (form.controls.referralCode.value.trim()) {
                <small class="text-muted">Te invitaron: en la prueba gratis tienes XASKA IA incluida.</small>
              }
            </label>
            <div class="flex flex-col gap-2">
              <span id="type-label" class="text-sm font-medium">Tipo de negocio</span>
              <app-business-type-picker [value]="type()" labelledBy="type-label" (pick)="type.set($event.code)" />
              <small class="text-muted">Decide lo que ves en el dock y en el inicio. Lo cambias después en Ajustes.</small>
            </div>
            <div class="flex justify-between mt-2">
              <a routerLink="/negocios" class="self-center text-sm text-muted hover:underline">Cancelar</a>
              <app-button label="Continuar" [disabled]="form.invalid" (clicked)="step.set(2)" />
            </div>
          } @else {
            <dl class="grid grid-cols-3 gap-2 text-sm">
              <dt class="text-muted">Nombre</dt><dd class="col-span-2">{{ form.value.tradeName }}</dd>
              <dt class="text-muted">Razón social</dt><dd class="col-span-2">{{ form.value.legalName }}</dd>
              <dt class="text-muted">Identificador</dt><dd class="col-span-2 font-mono">{{ form.value.slug }}</dd>
              <dt class="text-muted">Tipo</dt><dd class="col-span-2">{{ typeLabel() }}</dd>
              <dt class="text-muted">Empezar</dt><dd class="col-span-2">{{ modeLabel() }}</dd>
            </dl>
            <p class="text-sm text-muted">
              Se creará tu negocio con una sede principal, una caja y los roles por defecto.
            </p>
            <div class="flex justify-between mt-2">
              <app-button label="Atrás" [text]="true" severity="secondary" (clicked)="step.set(1)" />
              <app-button label="Crear negocio" [loading]="saving()" [disabled]="!verified()" (clicked)="create()" />
            </div>
          }
        </form>
      </section>
    </app-auth-layout>
  `,
})
export class CreateTenantComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly billing = inject(BillingApi);

  readonly trialDays = signal(14);
  /** Esta cuenta aún tiene su prueba gratis (decisión 303). */
  readonly trialAvailable = signal(true);
  readonly mode = signal<'trial' | 'pay' | 'code'>('trial');
  readonly plans = signal<BillingPlan[]>([]);
  readonly payPlan = signal('');
  private readonly startPlan = startPlanFrom(inject(ActivatedRoute).snapshot.queryParamMap);
  protected readonly modeLabel = computed(() => this.mode() === 'trial' ? `Prueba gratis de ${this.trialDays()} días`
    : this.mode() === 'pay' ? `Pagar ya: ${this.plans().find((p) => p.code === this.payPlan())?.name ?? ''}` : 'Con código de activación');

  readonly step = signal<1 | 2>(1);
  readonly type = signal<BusinessType>('RETAIL');
  protected readonly typeLabel = computed(() => businessTypeInfo(this.type()).label);
  readonly saving = signal(false);
  readonly activationCodeError = signal<string | null>(null);

  /** Sin el correo confirmado el backend no deja crear el negocio (403 EMAIL_NOT_VERIFIED). */
  readonly verified = computed(() => this.auth.user()?.emailVerified !== false);
  slugTouched = false;

  readonly form = inject(FormBuilder).nonNullable.group({
    tradeName: ['', [Validators.required, Validators.maxLength(200)]],
    legalName: ['', [Validators.required, Validators.maxLength(200)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]{2,40}$/)]],
    activationCode: ['', [Validators.maxLength(40)]],
    referralCode: [readReferral(), [Validators.maxLength(20)]],
  });
  readonly referralError = signal<string | null>(null);

  constructor() {
    this.http.get<{ trialDays: number; trialAvailable: boolean }>('/api/v1/tenants/signup-terms')
      .subscribe({
        next: (terms) => {
          this.trialDays.set(terms.trialDays);
          this.trialAvailable.set(terms.trialAvailable);
          if (!terms.trialAvailable && this.mode() === 'trial') {
            this.setMode('pay');
          }
        },
        error: () => undefined,
      });
    this.billing.pricing().subscribe({
      next: (p) => {
        this.plans.set(p.plans);
        const wanted = this.startPlan?.plan;
        this.payPlan.set(p.plans.some((x) => x.code === wanted) ? wanted! : (p.plans[1] ?? p.plans[0])?.code ?? '');
        if (wanted && p.plans.some((x) => x.code === wanted)) {
          // Eligió un plan en "Planes y precios": se propone pagarlo (puede volver a la prueba).
          this.setMode('pay');
        }
      },
      error: () => undefined,
    });
  }

  setMode(mode: 'trial' | 'pay' | 'code'): void {
    this.mode.set(mode);
    this.activationCodeError.set(null);
    const code = this.form.controls.activationCode;
    code.setValidators(mode === 'code' ? [Validators.required, Validators.pattern(/\S/), Validators.maxLength(40)]
      : [Validators.maxLength(40)]);
    code.updateValueAndValidity();
  }

  protected cop(v: number | null): string {
    return formatCop(v);
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
    const mode = this.mode();
    const code = mode === 'code' ? value.activationCode.trim() : '';
    const referral = normalizeReferral(value.referralCode);
    this.referralError.set(null);
    const payload: CreateTenantRequest = {
      tradeName: value.tradeName,
      legalName: value.legalName,
      slug: value.slug,
      businessType: this.type(),
      ...(code ? { activationCode: code } : {}),
      ...(mode === 'pay' ? { payNow: true } : {}),
      ...(referral ? { referralCode: referral } : {}),
    };

    this.auth.createTenant(payload).subscribe({
      next: (tenant) =>
        this.auth.selectTenant(tenant.id).subscribe({
          next: () => {
            const annual = this.startPlan?.annual === true;
            clearStartPlan();
            clearReferral();
            void (mode === 'pay'
              ? this.router.navigate(['/app/planes'], { queryParams: { plan: this.payPlan(), ciclo: annual ? 'anual' : 'mensual' } })
              : this.router.navigate(['/app']));
          },
          error: () => void this.router.navigate(['/negocios']),
        }),
      error: (err: unknown) => {
        this.saving.set(false);
        if (isEmailNotVerified(err)) {
          // La sesión decía "confirmado" pero el servidor no: refresca la cuenta para mostrar el aviso.
          this.auth.reloadUser().subscribe();
          return;
        }
        if (referral && isUnprocessable(err) && /invitaci/i.test(problemMessage(err))) {
          // Decisión 312: el código de invitación no sirve; el aviso va junto al campo.
          this.referralError.set(problemMessage(err));
          this.step.set(1);
          setTimeout(() => document.getElementById('referralCode')?.focus());
          return;
        }
        if (isActivationCodeRequired(err) || (code !== '' && isUnprocessable(err))) {
          // Sin prueba gratis disponible o código no válido: vuelve al paso 1 con el aviso junto al código (fase 8b).
          this.activationCodeError.set(problemMessage(err));
          this.step.set(1);
          setTimeout(() => (document.getElementById('activationCode') ?? document.getElementById('start-error'))?.focus());
          return;
        }
        this.step.set(1);
      },
    });
  }
}
