import { Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import { CREDIT_METHOD_CODE, DEPOSIT_METHOD_CODE, Order, PaymentMethod } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { OrdersApi } from '../../core/api/orders.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { permissionFlag } from '../../core/auth/permission-flag';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop } from '../../shared/money';
import { methodLabel } from '../pos/pos-labels';

/**
 * Anticipo o abono a un pedido (decisión 258). En efectivo entra a la caja abierta de quien lo recibe, el día que se
 * recibe; sin caja abierta solo lo registra quien tiene orders:manage. La clave de idempotencia se crea al abrir.
 */
@Component({
  selector: 'app-order-payment-dialog',
  imports: [FormsModule, InputTextModule, PesosInputDirective, FormDialogComponent],
  template: `
    @if (order(); as o) {
      <app-form-dialog [(visible)]="visible" [header]="'Anticipo al pedido ' + o.number" width="28rem"
                       submitLabel="Registrar anticipo" [dirty]="reference.trim().length > 0 || notes.trim().length > 0"
                       [invalidMessage]="problem()" [save]="saveRequest" [successMessage]="null"
                       (saved)="paid.emit($any($event))">
        <p class="text-sm">Falta por pagar <strong class="tabular-nums">{{ cop(o.balanceDue) }}</strong></p>
        <div class="flex flex-col gap-1">
          <label for="order-amount" class="text-sm font-medium">Valor</label>
          <input id="order-amount" appPesos class="h-12 border rounded-lg px-3 text-xl text-right tabular-nums"
                 [(ngModel)]="amount" name="amount" />
          @if (remaining() !== null) {
            <small class="text-xs text-muted">Quedaría faltando {{ cop(remaining()) }}</small>
          }
        </div>
        <fieldset class="flex flex-col gap-1">
          <legend class="text-sm font-medium mb-1">Medio de pago</legend>
          <div class="flex flex-wrap gap-2">
            @for (m of methods(); track m.id) {
              <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer"
                     [class.border-brand]="methodId === m.id">
                <input type="radio" name="order-method" [value]="m.id" [(ngModel)]="methodId" />
                {{ label(m) }}
              </label>
            }
          </div>
          @if (selected()?.affectsCash) {
            <small class="text-xs text-muted">El efectivo entra hoy a tu caja abierta.</small>
          } @else if (!canManage()) {
            <small class="text-xs text-muted">Necesitas tu caja abierta (o estar en la caja compartida).</small>
          }
        </fieldset>
        @if (selected() && !selected()!.affectsCash) {
          <div class="flex flex-col gap-1">
            <label for="order-reference" class="text-sm font-medium">
              Referencia
              @if (!selected()!.requiresReference) {
                <span class="text-muted font-normal">(opcional)</span>
              }
            </label>
            <input pInputText id="order-reference" name="reference" maxlength="60" [(ngModel)]="reference" />
          </div>
        }
        <div class="flex flex-col gap-1">
          <label for="order-notes" class="text-sm font-medium">Nota <span class="text-muted font-normal">(opcional)</span></label>
          <input pInputText id="order-notes" name="notes" maxlength="255" [(ngModel)]="notes" />
        </div>
      </app-form-dialog>
    }
  `,
})
export class OrderPaymentDialogComponent {
  private readonly api = inject(OrdersApi);
  private readonly cash = inject(CashApi);
  private readonly auth = inject(AuthService);
  protected readonly canManage = permissionFlag('orders:manage');

  readonly visible = model(false);
  readonly order = input<Order | null>(null);
  readonly paid = output<Order>();

  /** Medios para recibir dinero: todos menos "Fiado" y "Anticipo". */
  protected readonly methods = signal<PaymentMethod[]>([]);
  protected amount: number | null = null;
  protected methodId = '';
  protected reference = '';
  protected notes = '';
  private idempotencyKey = '';
  private methodsRequested = false;
  protected readonly cop = formatCop;

  /** Prepara un anticipo nuevo: por defecto la mitad de lo que falta (lo usual), en efectivo si tiene caja. */
  prepare(order: Order): void {
    this.amount = order.balanceDue > 0 ? Math.ceil(order.balanceDue / 2) : null;
    this.methodId = this.defaultMethod(this.methods());
    this.reference = '';
    this.notes = '';
    this.idempotencyKey = newIdempotencyKey('anticipo');
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
  }

  private defaultMethod(list: readonly PaymentMethod[]): string {
    const preferCash = this.auth.hasPermission('cash:operate');
    return (list.find((m) => m.affectsCash === preferCash) ?? list[0])?.id ?? '';
  }

  protected selected(): PaymentMethod | undefined {
    return this.methods().find((m) => m.id === this.methodId);
  }

  protected label(method: PaymentMethod): string {
    return methodLabel(method.code, method.name);
  }

  protected remaining(): number | null {
    const due = this.order()?.balanceDue ?? 0;
    const amount = Number(this.amount ?? 0);
    return amount > 0 && amount <= due ? due - amount : null;
  }

  protected problem(): string | null {
    const due = this.order()?.balanceDue ?? 0;
    const amount = Number(this.amount ?? 0);
    if (!(amount > 0)) {
      return 'Escribe el valor del anticipo.';
    }
    if (amount > due) {
      return `El anticipo no puede ser mayor que lo que falta por pagar (${formatCop(due)}).`;
    }
    const method = this.selected();
    if (!method) {
      return 'Elige el medio de pago.';
    }
    if (method.requiresReference && !method.affectsCash && !this.reference.trim()) {
      return 'Escribe la referencia del pago.';
    }
    return null;
  }

  protected readonly saveRequest = (): Observable<Order> => {
    const order = this.order()!;
    const method = this.selected();
    return this.api.pay(order.id, {
      amount: Number(this.amount),
      paymentMethodId: this.methodId,
      reference: method && !method.affectsCash ? this.reference.trim() || null : null,
      notes: this.notes.trim() || null,
    }, this.idempotencyKey).pipe(tap(() => (this.idempotencyKey = newIdempotencyKey('anticipo'))));
  };
}
