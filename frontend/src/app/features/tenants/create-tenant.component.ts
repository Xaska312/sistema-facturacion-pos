import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../../core/auth/auth.service';
import { slugify } from './slugify';

/**
 * Asistente de creación de negocio en dos pasos: datos del negocio y confirmación.
 * En esta versión solo está disponible el tipo RETAIL.
 */
@Component({
  selector: 'app-create-tenant',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule],
  template: `
    <main class="min-h-screen flex items-center justify-center p-4">
      <section class="w-full max-w-lg card p-6 flex flex-col gap-4">
        <header>
          <p class="text-xs text-muted">Paso {{ step() }} de 2</p>
          <h1 class="text-xl font-semibold">Crear negocio</h1>
        </header>

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
            <div class="rounded-lg bg-surface-alt p-3 text-sm">
              Tipo de negocio: <strong>Comercio (RETAIL)</strong>
              <span class="text-muted"> — farmacia, restaurante y servicios llegarán después.</span>
            </div>
            <div class="flex justify-between">
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
            <div class="flex justify-between">
              <p-button label="Atrás" [text]="true" severity="secondary" (onClick)="step.set(1)" />
              <p-button label="Crear negocio" [loading]="saving()" (onClick)="create()" />
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

  readonly step = signal<1 | 2>(1);
  readonly saving = signal(false);
  slugTouched = false;

  readonly form = inject(FormBuilder).nonNullable.group({
    tradeName: ['', [Validators.required, Validators.maxLength(200)]],
    legalName: ['', [Validators.required, Validators.maxLength(200)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]{2,40}$/)]],
  });

  suggestSlug(): void {
    if (!this.slugTouched) {
      this.form.controls.slug.setValue(slugify(this.form.controls.tradeName.value));
    }
  }

  create(): void {
    this.saving.set(true);
    const value = this.form.getRawValue();
    this.auth.createTenant({ ...value, businessType: 'RETAIL' }).subscribe({
      next: (tenant) =>
        this.auth.selectTenant(tenant.id).subscribe({
          next: () => void this.router.navigate(['/app']),
          error: () => void this.router.navigate(['/negocios']),
        }),
      error: () => {
        this.saving.set(false);
        this.step.set(1);
      },
    });
  }
}
