import { Component, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { Observable, tap } from 'rxjs';
import {
  CREDIT_METHOD_CODE,
  CreditAccount,
  DEPOSIT_METHOD_CODE,
  PaymentMethod,
  Quote,
  QuoteSaleResult,
  WITHHOLDING_METHOD_CODE,
} from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CreditApi } from '../../core/api/credit.api';
import { QuotesApi } from '../../core/api/quotes.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { formatCop } from '../../shared/money';
import { PaymentLinesComponent } from '../pos/payment-lines.component';
import { newPaymentLine, paymentLinesProblem, toPaymentRequests } from '../pos/payment-lines';
import { PaymentDraft } from '../pos/sale-math';
import { WithholdingBoxComponent } from '../finance/withholding-box.component';
import {
  NO_WITHHOLDING,
  TaxBases,
  WithholdingResult,
  sumBases,
  withholdingPayment,
  withholdingProblem,
} from '../finance/withholding-text';

/**
 * Vender una cotización con los precios y descuentos cotizados, en la caja abierta de quien vende (decisión 260).
 * La clave de idempotencia es la de la venta: reintentar no la duplica.
 */
@Component({
  selector: 'app-quote-sell-dialog',
  imports: [FormDialogComponent, PaymentLinesComponent, WithholdingBoxComponent],
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

        <!-- Retención del cliente (decisión 322); solo con un cliente registrado. -->
        <app-withholding-box [customerId]="q.customerId" [bases]="bases()" [result]="withheld()"
                             (resultChange)="onWithheld($event)" />
        @if (withheld().total > 0) {
          <p class="text-sm flex justify-between"><span>Retiene el cliente</span>
            <span class="tabular-nums">−{{ cop(withheld().total) }}</span></p>
        }
        @if (toPay() > 0) {
          <app-payment-lines [total]="toPay()" [methods]="payMethods()" [creditAvailable]="creditAvailable()"
                             [(lines)]="lines" />
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
  protected readonly lines = signal<PaymentDraft[]>([]);
  private idempotencyKey = '';
  private methodsRequested = false;
  protected readonly cop = formatCop;
  private readonly withholdingBox = viewChild(WithholdingBoxComponent);
  protected readonly withheld = signal<WithholdingResult>(NO_WITHHOLDING);
  private withholdingMethodId: string | null = null;

  protected readonly bases = computed<TaxBases>(() => sumBases(this.quote()?.items ?? []),
    { equal: (x, y) => x.base === y.base && x.iva === y.iva });

  protected toPay(): number {
    return Math.max(0, (this.quote()?.total ?? 0) - this.withheld().total);
  }

  protected onWithheld(result: WithholdingResult): void {
    this.withheld.set(result);
    const lines = this.lines();
    if (lines.length === 1) {
      this.lines.set([{ ...lines[0], amount: this.toPay() || null }]);
    }
  }

  prepare(quote: Quote): void {
    this.idempotencyKey = newIdempotencyKey('cotizacion');
    this.withholdingBox()?.reset();
    this.withheld.set(NO_WITHHOLDING);
    this.resetLines(quote.total);
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
      this.cash.allPaymentMethods().subscribe({
        next: (list) => {
          this.withholdingMethodId = list.find((m) => m.code === WITHHOLDING_METHOD_CODE)?.id ?? null;
          this.methods.set(list.filter((m) => m.code !== DEPOSIT_METHOD_CODE && m.code !== WITHHOLDING_METHOD_CODE));
          if (this.lines().every((l) => !l.methodId)) {
            this.resetLines(this.quote()?.total ?? 0);
          }
        },
        error: () => (this.methodsRequested = false),
      });
    }
  }

  /** Una sola línea en efectivo por el total. */
  private resetLines(total: number): void {
    const cash = this.methods().find((m) => m.affectsCash) ?? this.methods()[0];
    this.lines.set([newPaymentLine(cash, total)]);
  }

  /** "Fiado" solo si el cliente registrado tiene cupo. */
  protected payMethods(): PaymentMethod[] {
    const canCredit = !!this.quote()?.customerId && (this.credit()?.creditLimit ?? 0) > 0;
    return this.methods().filter((m) => m.code !== CREDIT_METHOD_CODE || canCredit);
  }

  protected creditAvailable(): number | null {
    const account = this.credit();
    return !!this.quote()?.customerId && account !== null && account.creditLimit > 0 ? account.available : null;
  }

  protected problem(): string | null {
    const retention = withholdingProblem(this.withheld());
    if (retention) {
      return retention;
    }
    if (this.withheld().total > (this.quote()?.total ?? 0)) {
      return 'La retención no puede ser mayor que el total.';
    }
    return this.toPay() > 0 ? paymentLinesProblem(this.toPay(), this.lines(), this.payMethods(), this.creditAvailable())
      : null;
  }

  protected readonly saveRequest = (): Observable<QuoteSaleResult> => {
    const quote = this.quote()!;
    const payments = this.toPay() > 0 ? toPaymentRequests(this.lines(), this.payMethods()) : [];
    const retention = withholdingPayment(this.withholdingMethodId, this.withheld());
    if (retention) {
      payments.push(retention);
    }
    return this.api.sell(quote.id, null, payments, this.idempotencyKey)
      .pipe(tap(() => (this.idempotencyKey = newIdempotencyKey('cotizacion'))));
  };
}
