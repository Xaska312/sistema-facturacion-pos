import { Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import {
  CREDIT_METHOD_CODE,
  CreditAccount,
  DEPOSIT_METHOD_CODE,
  PaymentMethod,
  Quote,
  QuoteSaleResult,
} from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CreditApi } from '../../core/api/credit.api';
import { QuotesApi } from '../../core/api/quotes.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop } from '../../shared/money';
import { methodLabel } from '../pos/pos-labels';

/**
 * Vender una cotización con los precios y descuentos cotizados, en la caja abierta de quien vende (decisión 260).
 * La clave de idempotencia es la de la venta: reintentar no la duplica.
 */
@Component({
  selector: 'app-quote-sell-dialog',
  imports: [FormsModule, InputTextModule, PesosInputDirective, FormDialogComponent],
  template: `
    @if (quote(); as q) {
      <app-form-dialog [(visible)]="visible" [header]="'Vender cotización ' + q.number" width="32rem"
                       submitLabel="Registrar venta" submitIcon="pi pi-shopping-cart"
                       [invalidMessage]="problem()" [save]="saveRequest" [successMessage]="null"
                       description="Se registra una venta con los precios cotizados, en tu caja abierta. El inventario baja ahora."
                       (saved)="sold.emit($any($event))">
        <div class="text-sm flex flex-col gap-1 border rounded-lg p-3 bg-surface-alt">
          <p class="flex justify-between"><span>{{ q.items.length }} {{ q.items.length === 1 ? 'línea' : 'líneas' }}</span>
            <span class="font-semibold tabular-nums">{{ cop(q.total) }}</span></p>
          <p class="text-xs text-muted">
            @if (q.customerId) {
              A nombre de {{ q.customerName }}.
            } @else {
              {{ q.prospectName }} no está registrado: la venta queda a consumidor final. Si la quiere a su nombre,
              regístralo y elígelo editando la cotización.
            }
          </p>
        </div>

        <fieldset class="flex flex-col gap-1">
          <legend class="text-sm font-medium mb-1">Cómo paga</legend>
          <div class="flex flex-wrap gap-2">
            @for (m of payMethods(); track m.id) {
              <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer"
                     [class.border-brand]="methodId === m.id">
                <input type="radio" name="quote-sell-method" [value]="m.id" [(ngModel)]="methodId" (ngModelChange)="fit()" />
                {{ label(m) }}
              </label>
            }
          </div>
        </fieldset>
        @if (selected()?.affectsCash) {
          <div class="flex flex-col gap-1">
            <label for="quote-sell-tendered" class="text-sm font-medium">Recibe</label>
            <input id="quote-sell-tendered" appPesos class="h-12 border rounded-lg px-3 text-xl text-right tabular-nums"
                   [(ngModel)]="tendered" name="tendered" />
            @if (change() > 0) {
              <small class="text-sm font-medium">Cambio {{ cop(change()) }}</small>
            }
          </div>
        } @else if (isCredit()) {
          <small class="text-xs text-muted">
            Queda fiado a {{ q.customerName }}. Cupo disponible {{ cop(credit()?.available ?? 0) }}.
          </small>
        } @else if (selected()) {
          <div class="flex flex-col gap-1">
            <label for="quote-sell-reference" class="text-sm font-medium">
              Referencia
              @if (!selected()!.requiresReference) {
                <span class="text-muted font-normal">(opcional)</span>
              }
            </label>
            <input pInputText id="quote-sell-reference" name="reference" maxlength="60" [(ngModel)]="reference" />
          </div>
        }
      </app-form-dialog>
    }
  `,
})
export class QuoteSellDialogComponent {
  private readonly api = inject(QuotesApi);
  private readonly cash = inject(CashApi);
  private readonly creditApi = inject(CreditApi);
  private readonly auth = inject(AuthService);

  readonly visible = model(false);
  readonly quote = input<Quote | null>(null);
  readonly sold = output<QuoteSaleResult>();

  protected readonly methods = signal<PaymentMethod[]>([]);
  /** "Fiado" solo aparece si el cliente tiene cupo, como en el POS (decisión 255). */
  protected readonly credit = signal<CreditAccount | null>(null);
  protected methodId = '';
  protected tendered: number | null = null;
  protected reference = '';
  private idempotencyKey = '';
  private methodsRequested = false;
  protected readonly cop = formatCop;

  prepare(quote: Quote): void {
    this.reference = '';
    this.idempotencyKey = newIdempotencyKey('cotizacion');
    this.methodId = this.methods().find((m) => m.affectsCash)?.id ?? this.methods()[0]?.id ?? '';
    this.tendered = quote.total || null;
    this.credit.set(null);
    const customerId = quote.customerId;
    if (customerId && this.auth.hasPermission('credit:read')) {
      this.creditApi.account(customerId).subscribe({
        next: (account) => {
          if (this.quote()?.customerId === account.customerId) {
            this.credit.set(account);
          }
        },
        error: () => undefined,
      });
    }
    if (!this.methodsRequested) {
      this.methodsRequested = true;
      this.cash.paymentMethods().subscribe({
        next: (list) => {
          const usable = list.filter((m) => m.code !== DEPOSIT_METHOD_CODE);
          this.methods.set(usable);
          this.methodId ||= usable.find((m) => m.affectsCash)?.id ?? usable[0]?.id ?? '';
        },
        error: () => (this.methodsRequested = false),
      });
    }
  }

  /** Lo recibido en efectivo se ajusta solo si quedó vacío o por debajo del total. */
  fit(): void {
    const total = this.quote()?.total ?? 0;
    if (this.tendered === null || Number(this.tendered) < total) {
      this.tendered = total || null;
    }
  }

  protected payMethods(): PaymentMethod[] {
    const canCredit = !!this.quote()?.customerId && (this.credit()?.creditLimit ?? 0) > 0;
    return this.methods().filter((m) => m.code !== CREDIT_METHOD_CODE || canCredit);
  }

  protected isCredit(): boolean {
    return this.selected()?.code === CREDIT_METHOD_CODE;
  }

  protected selected(): PaymentMethod | undefined {
    return this.payMethods().find((m) => m.id === this.methodId);
  }

  protected label(method: PaymentMethod): string {
    return methodLabel(method.code, method.name);
  }

  protected change(): number {
    const total = this.quote()?.total ?? 0;
    const tendered = Number(this.tendered ?? 0);
    return this.selected()?.affectsCash && tendered > total ? tendered - total : 0;
  }

  protected problem(): string | null {
    const total = this.quote()?.total ?? 0;
    const method = this.selected();
    if (!method) {
      return 'Elige cómo paga el cliente.';
    }
    if (method.affectsCash && Number(this.tendered ?? 0) < total) {
      return `Recibe al menos ${formatCop(total)}.`;
    }
    if (method.requiresReference && !method.affectsCash && !this.isCredit() && !this.reference.trim()) {
      return 'Escribe la referencia del pago.';
    }
    return null;
  }

  protected readonly saveRequest = (): Observable<QuoteSaleResult> => {
    const quote = this.quote()!;
    const method = this.selected()!;
    const payments = [{
      paymentMethodId: method.id,
      amount: method.affectsCash ? Number(this.tendered) : quote.total,
      reference: method.affectsCash || this.isCredit() ? null : this.reference.trim() || null,
    }];
    return this.api.sell(quote.id, null, payments, this.idempotencyKey)
      .pipe(tap(() => (this.idempotencyKey = newIdempotencyKey('cotizacion'))));
  };
}
