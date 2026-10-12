import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { Subscription, SubscriptionStatus } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { SubscriptionApi } from '../../core/api/subscription.api';
import { AuthService } from '../../core/auth/auth.service';
import { formatDate } from '../../shared/format';
import { formatCop } from '../../shared/money';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { BrandingSectionComponent } from './branding-section.component';

/** Zonas horarias de Colombia y vecinas más usadas; el backend acepta cualquier zona IANA válida. */
export const TIMEZONES = ['America/Bogota', 'America/Panama', 'America/Lima', 'America/Guayaquil', 'America/Caracas'];

/** El nombre escrito para confirmar coincide con el del negocio (sin distinguir mayúsculas ni espacios extremos). */
export function confirmsName(typed: string, tradeName: string | null | undefined): boolean {
  return !!tradeName && typed.trim().toLocaleLowerCase('es-CO') === tradeName.trim().toLocaleLowerCase('es-CO');
}

/** Nombre para el usuario (el valor guardado sigue siendo la zona IANA). */
const TIMEZONE_LABEL: Record<string, string> = {
  'America/Bogota': 'Colombia (Bogotá)',
  'America/Panama': 'Panamá',
  'America/Lima': 'Perú (Lima)',
  'America/Guayaquil': 'Ecuador (Guayaquil)',
  'America/Caracas': 'Venezuela (Caracas)',
};

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, PageHeaderComponent, FormDialogComponent,
    BrandingSectionComponent],
  template: `
    <app-page-header title="Ajustes del negocio" description="Cómo funciona tu negocio: inventario, impuestos, zona horaria, moneda, tiquete y marca." />

    @if (sub(); as s) {
      <section class="card p-4 md:p-6 mb-6 flex flex-col gap-4 max-w-2xl">
        <h2 class="text-base font-semibold">Suscripción</h2>
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div class="flex flex-col gap-1">
            <dt class="text-muted">Plan</dt>
            <dd class="font-medium">{{ s.plan.name }}</dd>
          </div>
          <div class="flex flex-col gap-1">
            <dt class="text-muted">Estado</dt>
            <dd>{{ statusLabel(s.status) }}</dd>
          </div>
          <div class="flex flex-col gap-1">
            <dt class="text-muted">Inicio</dt>
            <dd>{{ formatDate(s.startedAt) }}</dd>
          </div>
          <div class="flex flex-col gap-1">
            <dt class="text-muted">Fin</dt>
            <dd>{{ formatDate(s.endsAt) }} @if (s.daysLeft > 0) { <span class="text-muted">({{ s.daysLeft === 1 ? 'queda 1 día' : 'quedan ' + s.daysLeft + ' días' }})</span> }</dd>
          </div>
          <div class="flex flex-col gap-1">
            <dt class="text-muted">Uso de sucursales</dt>
            <dd>{{ s.usage.branches }} de {{ s.plan.maxBranches ?? 'sin límite' }}</dd>
          </div>
          <div class="flex flex-col gap-1">
            <dt class="text-muted">Uso de usuarios</dt>
            <dd>{{ s.usage.users }} de {{ s.plan.maxUsers ?? 'sin límite' }}</dd>
          </div>
          @if (s.plan.monthlyPrice !== null || s.plan.annualPrice !== null) {
            <div class="flex flex-col gap-1 sm:col-span-2">
              <dt class="text-muted">Precio</dt>
              <dd>
                @if (s.plan.monthlyPrice !== null) { {{ cop(s.plan.monthlyPrice) }} mes }
                @if (s.plan.monthlyPrice !== null && s.plan.annualPrice !== null) { <span class="text-muted mx-1">•</span> }
                @if (s.plan.annualPrice !== null) { {{ cop(s.plan.annualPrice) }} año }
              </dd>
            </div>
          }
          <div class="flex flex-col gap-1 sm:col-span-2">
            <dt class="text-muted">Cómo pagar</dt>
            <dd>{{ s.paymentInstructions }}</dd>
          </div>
        </dl>

        @if (s.payments.length > 0) {
          <h3 class="text-sm font-semibold mt-2">Pagos registrados</h3>
          <div class="overflow-x-auto border border-line rounded">
            <table class="w-full text-left text-sm whitespace-nowrap">
              <caption class="sr-only">Pagos registrados</caption>
              <thead class="bg-surface-alt border-b border-line text-muted">
                <tr>
                  <th scope="col" class="p-2 font-medium">Fecha</th>
                  <th scope="col" class="p-2 font-medium">Periodo</th>
                  <th scope="col" class="p-2 font-medium">Valor</th>
                  <th scope="col" class="p-2 font-medium">Medio</th>
                  <th scope="col" class="p-2 font-medium">Referencia</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line">
                @for (p of s.payments; track p.id) {
                  <tr>
                    <td class="p-2">{{ formatDate(p.createdAt) }}</td>
                    <td class="p-2">{{ formatDate(p.periodStart) }} – {{ formatDate(p.periodEnd) }}</td>
                    <td class="p-2">{{ p.source === 'CODE' ? '—' : cop(p.amount) }}</td>
                    <td class="p-2">{{ p.source === 'CODE' ? 'Código de activación' : p.method }}</td>
                    <td class="p-2">{{ p.reference ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    }

    <form [formGroup]="form" (ngSubmit)="save()" class="card p-4 md:p-6 flex flex-col gap-4 max-w-2xl">
      <fieldset [disabled]="!canEdit()" class="flex flex-col gap-4">
        <label class="flex items-start gap-3">
          <input type="checkbox" class="mt-1" formControlName="allowNegativeStock" />
          <span><span class="font-medium">Permitir vender sin existencias</span>
            <span class="block text-sm text-muted">Si está apagado, una venta sin stock suficiente se rechaza.</span></span>
        </label>
        <label class="flex items-start gap-3">
          <input type="checkbox" class="mt-1" formControlName="pricesIncludeTax" />
          <span><span class="font-medium">Los precios incluyen impuestos</span>
            <span class="block text-sm text-muted">El precio de venta ya trae el IVA incluido.</span></span>
        </label>
        <div class="grid gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Zona horaria</span>
            <select formControlName="timezone" class="border rounded px-2 py-2">
              @for (zone of timezones; track zone) {
                <option [value]="zone">{{ timezoneLabel(zone) }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Moneda</span>
            <select formControlName="currency" class="border rounded px-2 py-2">
              <option value="COP">Peso colombiano (COP)</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Descuento máximo sin autorización (%)</span>
            <input pInputText type="number" min="0" max="100" step="0.5" formControlName="maxDiscountPercent"
                   aria-describedby="discount-help" />
            <span id="discount-help" class="text-xs text-muted">
              Cualquier vendedor puede descontar hasta este porcentaje por producto; más allá, solo quien tiene el
              permiso de dar descuentos.
            </span>
          </label>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Pie del recibo</span>
          <textarea formControlName="receiptFooter" rows="3" maxlength="500" class="border rounded px-2 py-2"
                    aria-describedby="footer-help"></textarea>
          <span id="footer-help" class="text-xs text-muted">Sale al final de cada tiquete: horario, redes sociales,
            política de cambios…</span>
        </label>
      </fieldset>
      @if (canEdit()) {
        <div class="flex justify-end">
          <p-button type="submit" label="Guardar" [loading]="saving()" [disabled]="form.invalid || form.pristine" />
        </div>
      } @else {
        <p class="text-sm text-muted">Solo lectura: no tienes permiso para modificar los ajustes.</p>
      }
    </form>

    <app-branding-section />

    @if (isOwner()) {
      <section class="card p-4 md:p-6 mt-6 max-w-2xl border border-danger" aria-labelledby="danger-title">
        <h2 id="danger-title" class="text-base font-semibold text-danger">Eliminar el negocio</h2>
        <p class="text-sm text-muted mt-1">
          El negocio queda suspendido: nadie podrá entrar y se cierran todas las sesiones abiertas. Los datos no se
          borran (ventas, inventario, clientes); para recuperarlo hay que pedirlo a soporte.
        </p>
        <div class="mt-3">
          <p-button label="Eliminar negocio…" icon="pi pi-trash" severity="danger" [outlined]="true" (onClick)="openClose()" />
        </div>
      </section>
    }

    <app-form-dialog [(visible)]="closeOpen" header="Eliminar el negocio" width="30rem" submitLabel="Eliminar negocio"
                     submitIcon="pi pi-trash" [destructive]="true" [dirty]="closeName.length > 0 || closePassword.length > 0"
                     [invalidMessage]="closeInvalid()" [save]="closeRequest" successMessage="Negocio eliminado"
                     (saved)="afterClose()"
                     description="Para confirmar, escribe el nombre del negocio y tu contraseña. Tendrás que volver a iniciar sesión.">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label for="close-name" class="text-sm font-medium">Nombre del negocio</label>
          <input pInputText id="close-name" autocomplete="off" [(ngModel)]="closeName" [placeholder]="tradeName() ?? ''" />
          <small class="text-muted">Escribe: <strong>{{ tradeName() }}</strong></small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="close-password" class="text-sm font-medium">Tu contraseña</label>
          <input pInputText id="close-password" type="password" autocomplete="current-password" [(ngModel)]="closePassword" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="close-reason" class="text-sm font-medium">Motivo (opcional)</label>
          <input pInputText id="close-reason" maxlength="300" [(ngModel)]="closeReason" placeholder="Cerré el local" />
        </div>
      </div>
    </app-form-dialog>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(OrganizationApi);
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly formatDate = formatDate;
  protected readonly cop = formatCop;

  protected readonly canEdit = computed(() => this.auth.hasPermission('settings:manage'));
  /** Solo el dueño puede eliminar (cerrar) el negocio; el backend lo vuelve a comprobar. */
  protected readonly isOwner = computed(() => this.auth.currentTenant()?.owner === true);
  protected readonly tradeName = computed(() => this.auth.currentTenant()?.tradeName ?? null);
  protected closeOpen = false;
  protected closeName = '';
  protected closePassword = '';
  protected closeReason = '';
  protected readonly timezones = TIMEZONES;
  protected timezoneLabel(zone: string): string {
    return TIMEZONE_LABEL[zone] ?? zone;
  }
  protected readonly saving = signal(false);
  protected readonly sub = signal<Subscription | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    allowNegativeStock: [false],
    pricesIncludeTax: [true],
    timezone: ['America/Bogota', Validators.required],
    currency: ['COP', Validators.required],
    maxDiscountPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    receiptFooter: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.api.settings().subscribe((settings) => {
      this.form.reset(settings);
    });
    this.subscriptionApi.current().subscribe({
      next: (s) => this.sub.set(s),
      error: () => { /* ignore */ }
    });
  }

  protected statusLabel(status: SubscriptionStatus): string {
    switch (status) {
      case 'TRIAL': return 'Prueba gratis';
      case 'ACTIVE': return 'Activa';
      case 'PAST_DUE': return 'Vencida, en gracia';
      case 'EXPIRED': return 'Vencida';
    }
  }

  save(): void {
    this.saving.set(true);
    this.api.updateSettings(this.form.getRawValue()).subscribe({
      next: (settings) => {
        this.saving.set(false);
        this.form.reset(settings);
        this.messages.add({ severity: 'success', summary: 'Ajustes guardados' });
      },
      error: () => this.saving.set(false),
    });
  }

  openClose(): void {
    this.closeName = '';
    this.closePassword = '';
    this.closeReason = '';
    this.closeOpen = true;
  }

  protected closeInvalid(): string | null {
    if (!confirmsName(this.closeName, this.tradeName())) {
      return 'Escribe el nombre del negocio tal como aparece.';
    }
    return this.closePassword ? null : 'Escribe tu contraseña.';
  }

  protected readonly closeRequest = (): Observable<void> => {
    const tenantId = this.auth.tenantId();
    if (!tenantId) {
      throw new Error('Sin negocio');
    }
    return this.auth.closeTenant(tenantId, this.closeName.trim(), this.closePassword, this.closeReason.trim() || null);
  };

  /** Las sesiones del negocio quedaron cerradas: se vuelve a iniciar sesión. */
  afterClose(): void {
    this.closePassword = '';
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
