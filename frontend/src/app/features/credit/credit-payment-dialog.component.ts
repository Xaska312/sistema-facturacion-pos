import { Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import { CREDIT_METHOD_CODE, CreditAccount, CreditEntry, PaymentMethod } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CreditApi } from '../../core/api/credit.api';
import { AuthService } from '../../core/auth/auth.service';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop } from '../../shared/money';
import { methodLabel } from '../pos/pos-labels';

/**
 * Abono de un cliente a su fiado (decisión 255). En efectivo entra a la caja abierta de quien lo recibe; con otro
 * medio no hace falta caja. La clave de idempotencia se crea al abrir: reintentar no registra dos abonos.
 */
@Component({
  selector: 'app-credit-payment-dialog',
  imports: [FormsModule, InputTextModule, PesosInputDirective, FormDialogComponent],
  template: `
    @if (account(); as a) {
      <app-form-dialog [(visible)]="visible" [header]="'Abono de ' + a.name" width="28rem" submitLabel="Registrar abono"
                       [dirty]="amount !== a.balance || reference.trim().length > 0" [invalidMessage]="problem()"
                       [save]="saveRequest" [successMessage]="null" (saved)="paid.emit($any($event))">
        <p class="text-sm">Debe <strong class="tabular-nums">{{ cop(a.balance) }}</strong></p>
        <div class="flex flex-col gap-1">
          <label for="credit-amount" class="text-sm font-medium">Valor del abono</label>
          <input id="credit-amount" appPesos class="h-12 border rounded-lg px-3 text-xl text-right tabular-nums"
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
                <input type="radio" name="credit-method" [value]="m.id" [(ngModel)]="methodId" />
                {{ label(m) }}
              </label>
            }
          </div>
          @if (selected()?.affectsCash) {
            <small class="text-xs text-muted">El efectivo entra a tu caja abierta.</small>
          }
        </fieldset>
        @if (selected() && !selected()!.affectsCash) {
          <div class="flex flex-col gap-1">
            <label for="credit-reference" class="text-sm font-medium">
              Referencia
              @if (!selected()!.requiresReference) {
                <span class="text-muted font-normal">(opcional)</span>
              }
            </label>
            <input pInputText id="credit-reference" name="reference" maxlength="60" [(ngModel)]="reference" />
          </div>
        }
        <div class="flex flex-col gap-1">
          <label for="credit-notes" class="text-sm font-medium">Nota <span class="text-muted font-normal">(opcional)</span></label>
          <input pInputText id="credit-notes" name="notes" maxlength="255" [(ngModel)]="notes" />
        </div>
      </app-form-dialog>
    }
  `,
})
export class CreditPaymentDialogComponent {
  private readonly api = inject(CreditApi);
  private readonly cash = inject(CashApi);
  private readonly auth = inject(AuthService);

  readonly visible = model(false);
  readonly account = input<CreditAccount | null>(null);
  readonly paid = output<CreditEntry>();

  /** Medios para abonar: todos menos "Fiado". */
  protected readonly methods = signal<PaymentMethod[]>([]);
  protected amount: number | null = null;
  protected methodId = '';
  protected reference = '';
  protected notes = '';
  private idempotencyKey = '';
  private methodsRequested = false;
  protected readonly cop = formatCop;

  /**
   * Prepara el formulario para un abono nuevo: por defecto, todo lo que debe y en efectivo (sin caja propia, el primer
   * medio que no es efectivo). Los medios se piden la primera vez que se abre.
   */
  prepare(account: CreditAccount): void {
    this.amount = account.balance > 0 ? account.balance : null;
    this.methodId = this.defaultMethod(this.methods());
    this.reference = '';
    this.notes = '';
    this.idempotencyKey = newIdempotencyKey('abono');
    if (!this.methodsRequested) {
      this.methodsRequested = true;
      this.cash.paymentMethods().subscribe({
        next: (list) => {
          const usable = list.filter((m) => m.code !== CREDIT_METHOD_CODE);
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
    const balance = this.account()?.balance ?? 0;
    const amount = Number(this.amount ?? 0);
    return amount > 0 && amount <= balance ? balance - amount : null;
  }

  protected problem(): string | null {
    const balance = this.account()?.balance ?? 0;
    const amount = Number(this.amount ?? 0);
    if (!(amount > 0)) {
      return 'Escribe el valor del abono.';
    }
    if (amount > balance) {
      return `El abono no puede ser mayor que lo que debe (${formatCop(balance)}).`;
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

  protected readonly saveRequest = (): Observable<CreditEntry> => {
    const account = this.account()!;
    const method = this.selected();
    return this.api.pay(account.customerId, {
      amount: Number(this.amount),
      paymentMethodId: this.methodId,
      reference: method && !method.affectsCash ? this.reference.trim() || null : null,
      notes: this.notes.trim() || null,
    }, this.idempotencyKey).pipe(tap(() => (this.idempotencyKey = newIdempotencyKey('abono'))));
  };
}
