import { Component, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import { CREDIT_METHOD_CODE, DEPOSIT_METHOD_CODE, PaymentMethod } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { PurchaseSummary, PurchasesApi, SupplierPayment } from '../../core/api/purchases.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop } from '../../shared/money';
import { methodLabel } from '../pos/pos-labels';
import { receiptNumber } from './purchase-text';

/**
 * Pago (total o abono) de una factura de proveedor (Fase 13-2, decisión 280). En efectivo sale de la caja abierta de
 * quien paga y no puede pasar de lo que hay en ella; con transferencia u otro medio no hace falta caja. La clave de
 * idempotencia se crea al abrir: reintentar no registra dos pagos.
 */
@Component({
  selector: 'app-supplier-payment-dialog',
  imports: [FormsModule, InputTextModule, PesosInputDirective, FormDialogComponent],
  template: `
    @if (receipt(); as r) {
      <app-form-dialog [(visible)]="visible" [header]="'Pago a ' + (r.supplierName ?? 'proveedor')" width="28rem"
                       submitLabel="Registrar pago" [dirty]="amount !== r.balance || reference.trim().length > 0"
                       [invalidMessage]="problem()" [save]="saveRequest" [successMessage]="null"
                       (saved)="paid.emit($any($event))">
        <p class="text-sm">Factura <strong>{{ r.supplierInvoice }}</strong> ({{ number(r.number) }}) · saldo
          <strong class="tabular-nums">{{ cop(r.balance) }}</strong></p>
        <div class="flex flex-col gap-1">
          <label for="supplier-amount" class="text-sm font-medium">Valor del pago</label>
          <input id="supplier-amount" appPesos class="h-12 border rounded-lg px-3 text-xl text-right tabular-nums"
                 [(ngModel)]="amount" name="amount" />
          @if (remaining() !== null) {
            <small class="text-xs text-muted">Queda debiendo {{ cop(remaining()) }}</small>
          }
        </div>
        <fieldset class="flex flex-col gap-1">
          <legend class="text-sm font-medium mb-1">Medio de pago</legend>
          <div class="flex flex-wrap gap-2">
            @for (m of methods(); track m.id) {
              <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer"
                     [class.border-brand]="methodId === m.id">
                <input type="radio" name="supplier-method" [value]="m.id" [(ngModel)]="methodId" />
                {{ label(m) }}
              </label>
            }
          </div>
          @if (selected()?.affectsCash) {
            <small class="text-xs text-muted">Sale de tu caja abierta (no puede pasar de lo que hay en ella).</small>
          }
        </fieldset>
        @if (selected() && !selected()!.affectsCash) {
          <div class="flex flex-col gap-1">
            <label for="supplier-reference" class="text-sm font-medium">Referencia <span class="text-muted font-normal">(opcional)</span></label>
            <input pInputText id="supplier-reference" name="reference" maxlength="100" [(ngModel)]="reference" />
          </div>
        }
      </app-form-dialog>
    }
  `,
})
export class SupplierPaymentDialogComponent {
  private readonly api = inject(PurchasesApi);
  private readonly cash = inject(CashApi);

  readonly visible = model(false);
  readonly paid = output<SupplierPayment>();

  protected readonly receipt = signal<PurchaseSummary | null>(null);
  protected readonly methods = signal<PaymentMethod[]>([]);
  protected amount: number | null = null;
  protected methodId = '';
  protected reference = '';
  private idempotencyKey = '';
  private methodsRequested = false;
  protected readonly cop = formatCop;
  protected readonly number = receiptNumber;

  /** Prepara un pago nuevo: por defecto, todo el saldo por transferencia (lo usual con proveedores). */
  open(receipt: PurchaseSummary): void {
    this.receipt.set(receipt);
    this.amount = receipt.balance > 0 ? receipt.balance : null;
    this.methodId = this.defaultMethod(this.methods());
    this.reference = '';
    this.idempotencyKey = newIdempotencyKey('pago-prov');
    if (!this.methodsRequested) {
      this.methodsRequested = true;
      this.cash.paymentMethods().subscribe({
        next: (list) => {
          const usable = list.filter((m) => m.code !== CREDIT_METHOD_CODE && m.code !== DEPOSIT_METHOD_CODE);
          this.methods.set(usable);
          this.methodId ||= this.defaultMethod(usable);
        },
        error: () => (this.methodsRequested = false),
      });
    }
    this.visible.set(true);
  }

  private defaultMethod(list: readonly PaymentMethod[]): string {
    return (list.find((m) => !m.affectsCash) ?? list[0])?.id ?? '';
  }

  protected selected(): PaymentMethod | undefined {
    return this.methods().find((m) => m.id === this.methodId);
  }

  protected label(method: PaymentMethod): string {
    return methodLabel(method.code, method.name);
  }

  protected remaining(): number | null {
    const balance = this.receipt()?.balance ?? 0;
    const amount = Number(this.amount ?? 0);
    return amount > 0 && amount < balance ? balance - amount : null;
  }

  protected problem(): string | null {
    const balance = this.receipt()?.balance ?? 0;
    const amount = Number(this.amount ?? 0);
    if (!(amount > 0)) {
      return 'Escribe el valor del pago.';
    }
    if (amount > balance) {
      return `El pago no puede ser mayor que el saldo (${formatCop(balance)}).`;
    }
    return this.selected() ? null : 'Elige el medio de pago.';
  }

  protected readonly saveRequest = (): Observable<SupplierPayment> => {
    const method = this.selected();
    return this.api.pay(this.receipt()!.id, {
      amount: Number(this.amount),
      paymentMethodId: this.methodId,
      reference: method && !method.affectsCash ? this.reference.trim() || null : null,
    }, this.idempotencyKey).pipe(tap(() => (this.idempotencyKey = newIdempotencyKey('pago-prov'))));
  };
}
