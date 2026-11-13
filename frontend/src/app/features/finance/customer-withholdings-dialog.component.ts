import { Component, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../shared/ui/toast.service';
import { Observable, tap } from 'rxjs';
import { Party } from '../../core/api/api.models';
import { CustomerWithholding, WithholdingType, WithholdingsApi } from '../../core/api/withholdings.api';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { WITHHOLDING_TYPES, usualText } from './withholding-text';

interface Row {
  type: WithholdingType;
  label: string;
  hint: string;
  on: boolean;
  rate: number | null;
}

/**
 * Retenciones habituales de un cliente (decisión 322): las que siempre le hace al negocio (Indesa: retefuente 6 %).
 * Al cobrarle aparecen listas, y quien cobra sin el permiso de finanzas solo puede aplicar estas.
 */
@Component({
  selector: 'app-customer-withholdings-dialog',
  imports: [FormsModule, FormDialogComponent],
  template: `
    @if (customer(); as c) {
      <app-form-dialog [(visible)]="visible" [header]="'Retenciones de ' + c.displayName" width="30rem"
                       [dirty]="dirty" [invalidMessage]="problem()" [save]="saveRequest" [successMessage]="null"
                       description="Las que este cliente te hace siempre al pagar. Al cobrarle aparecen listas para confirmar."
                       (saved)="onSaved()">
        @for (r of rows(); track r.type) {
          <div class="flex flex-wrap items-center gap-3 min-h-11">
            <label class="flex items-center gap-2 flex-1 min-w-40 cursor-pointer">
              <input type="checkbox" class="size-5" [(ngModel)]="r.on" [name]="'on-' + r.type"
                     (ngModelChange)="dirty = true" />
              <span><span class="font-medium">{{ r.label }}</span>
                <span class="block text-xs text-muted">{{ r.hint }}</span></span>
            </label>
            @if (r.on) {
              <label class="flex items-center gap-2 text-sm">
                <input type="number" min="0" max="100" step="0.001" class="w-24 h-11 border rounded-lg px-2 text-right"
                       [(ngModel)]="r.rate" [name]="'rate-' + r.type" (ngModelChange)="dirty = true"
                       [attr.aria-label]="'Tarifa de ' + r.label" />
                <span>%</span>
              </label>
            }
          </div>
        }
        <p class="text-xs text-muted">ReteICA en porcentaje: 9,66 por mil es 0,966 %.</p>
      </app-form-dialog>
    }
  `,
})
export class CustomerWithholdingsDialogComponent {
  private readonly api = inject(WithholdingsApi);
  private readonly messages = inject(ToastService);

  readonly visible = model(false);
  protected readonly customer = signal<Party | null>(null);
  protected readonly rows = signal<Row[]>([]);
  protected dirty = false;

  open(customer: Party): void {
    this.customer.set(customer);
    this.dirty = false;
    this.rows.set(WITHHOLDING_TYPES.map((t) => ({ type: t.type, label: t.label, hint: t.hint, on: false, rate: null })));
    this.api.usual(customer.id).subscribe((list) => this.rows.set(WITHHOLDING_TYPES.map((t) => {
      const found = list.find((u) => u.type === t.type);
      return { type: t.type, label: t.label, hint: t.hint, on: !!found, rate: found?.rate ?? null };
    })));
    this.visible.set(true);
  }

  protected problem(): string | null {
    for (const r of this.rows()) {
      if (r.on && !(Number(r.rate) > 0 && Number(r.rate) <= 100)) {
        return `Escribe la tarifa de la ${r.label} (más de 0 y hasta 100 %).`;
      }
    }
    return null;
  }

  protected readonly saveRequest = (): Observable<CustomerWithholding[]> => {
    const items = this.rows().filter((r) => r.on).map((r) => ({ type: r.type, rate: Number(r.rate) }));
    return this.api.setUsual(this.customer()!.id, items).pipe(tap((saved) => {
      this.messages.add({ severity: 'success', summary: 'Retenciones guardadas',
        detail: saved.length === 0 ? 'Este cliente no hace retenciones.' : usualText(saved), life: 3000 });
    }));
  };

  protected onSaved(): void {
    this.dirty = false;
  }
}
