import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

/** Zonas horarias de Colombia y vecinas más usadas; el backend acepta cualquier zona IANA válida. */
export const TIMEZONES = ['America/Bogota', 'America/Panama', 'America/Lima', 'America/Guayaquil', 'America/Caracas'];

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PageHeaderComponent],
  template: `
    <app-page-header title="Ajustes del negocio" description="Cómo funciona tu negocio: inventario, impuestos, zona horaria, moneda y tiquete." />
    <form [formGroup]="form" (ngSubmit)="save()" class="card p-4 md:p-6 flex flex-col gap-4 max-w-2xl">
      <fieldset [disabled]="!canEdit" class="flex flex-col gap-4">
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
                <option [value]="zone">{{ zone }}</option>
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
            <input pInputText type="number" min="0" max="100" step="0.5" formControlName="maxDiscountPercent" />
          </label>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Pie del recibo</span>
          <textarea formControlName="receiptFooter" rows="3" maxlength="500" class="border rounded px-2 py-2"></textarea>
        </label>
      </fieldset>
      @if (canEdit) {
        <div class="flex justify-end">
          <p-button type="submit" label="Guardar" [loading]="saving()" [disabled]="form.invalid || form.pristine" />
        </div>
      } @else {
        <p class="text-sm text-muted">Solo lectura: no tienes permiso para modificar los ajustes.</p>
      }
    </form>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(OrganizationApi);
  private readonly messages = inject(MessageService);
  protected readonly canEdit = inject(AuthService).hasPermission('settings:manage');
  protected readonly timezones = TIMEZONES;
  protected readonly saving = signal(false);

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
}
