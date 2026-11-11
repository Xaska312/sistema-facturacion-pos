import { Component, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { Observable, tap } from 'rxjs';
import {
  CREDIT_METHOD_CODE,
  CreditAccount,
  DEPOSIT_METHOD_CODE,
  Order,
  OrderDelivery,
  OrderItem,
  PaymentMethod,
  WITHHOLDING_METHOD_CODE,
} from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CreditApi } from '../../core/api/credit.api';
import { OrdersApi } from '../../core/api/orders.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { formatCop } from '../../shared/money';
import { PaymentLinesComponent } from '../pos/payment-lines.component';
import { newPaymentLine, paymentLinesProblem, toPaymentRequests } from '../pos/payment-lines';
import { PaymentDraft } from '../pos/sale-math';
import { deliveryAmounts, sizeText } from './order-text';
import { WithholdingBoxComponent } from '../finance/withholding-box.component';
import {
  NO_WITHHOLDING,
  TaxBases,
  WithholdingResult,
  proportionalBases,
  sumBases,
  withholdingPayment,
  withholdingProblem,
} from '../finance/withholding-text';

/**
 * Entregar un pedido, todo o una parte (decisión 258): se registra una venta con lo entregado, en tu caja abierta.
 * La clave de idempotencia es la de la venta: reintentar no la duplica.
 */
@Component({
  selector: 'app-order-deliver-dialog',
  imports: [FormDialogComponent, PaymentLinesComponent, WithholdingBoxComponent],
  template: `
    @if (order(); as o) {
      <app-form-dialog [(visible)]="visible" [header]="'Entregar pedido ' + o.number" width="34rem"
                       submitLabel="Entregar y registrar venta" submitIcon="pi pi-check-circle"
                       [invalidMessage]="problem()" [save]="saveRequest" [successMessage]="null"
                       description="Se registra una venta con lo que entregas, en tu caja abierta. El inventario baja ahora."
                       (saved)="delivered.emit($any($event))">
        <fieldset class="flex flex-col gap-1">
          <legend class="text-sm font-medium mb-1">Qué entregas</legend>
          @for (item of pending(); track item.id) {
            <label class="flex items-start gap-2 min-h-11 px-3 py-2 border rounded-lg cursor-pointer"
                   [class.border-brand]="chosen().has(item.id)">
              <input type="checkbox" class="mt-1" [checked]="chosen().has(item.id)" (change)="toggle(item)" />
              <span class="flex-1">
                {{ item.productName }}{{ item.description ? ' · ' + item.description : '' }}
                <span class="block text-xs text-muted">{{ size(item) }}</span>
              </span>
              <span class="tabular-nums">{{ cop(item.total) }}</span>
            </label>
          }
        </fieldset>

        <div class="text-sm flex flex-col gap-1 border rounded-lg p-3 bg-surface-alt">
          <p class="flex justify-between"><span>Valor de lo entregado</span><span class="tabular-nums">{{ cop(amounts().total) }}</span></p>
          @if (amounts().applied > 0) {
            <p class="flex justify-between"><span>Se descuenta del anticipo</span>
              <span class="tabular-nums">−{{ cop(amounts().applied) }}</span></p>
          }
          <p class="flex justify-between font-semibold"><span>El cliente paga ahora</span>
            <span class="tabular-nums">{{ cop(amounts().remaining) }}</span></p>
        </div>

        @if (amounts().remaining > 0) {
          <!-- Retención del cliente (decisión 322) sobre lo que paga ahora. -->
          <app-withholding-box [customerId]="o.customerId" [bases]="bases()" [result]="withheld()"
                               (resultChange)="onWithheld($event)" />
          @if (withheld().total > 0) {
            <p class="text-sm flex justify-between"><span>Retiene el cliente</span>
              <span class="tabular-nums">−{{ cop(withheld().total) }}</span></p>
          }
          @if (toPay() > 0) {
            <app-payment-lines [total]="toPay()" [methods]="payMethods()" [creditAvailable]="creditAvailable()"
                               [(lines)]="lines" />
          }
        }
      </app-form-dialog>
    }
  `,
})
export class OrderDeliverDialogComponent {
  private readonly api = inject(OrdersApi);
  private readonly cash = inject(CashApi);
  private readonly creditApi = inject(CreditApi);
  private readonly auth = inject(AuthService);

  readonly visible = model(false);
  readonly order = input<Order | null>(null);
  readonly delivered = output<OrderDelivery>();

  protected readonly pending = signal<OrderItem[]>([]);
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());
  /** Medios para cobrar el resto, como en el POS (el anticipo se aplica solo). */
  protected readonly methods = signal<PaymentMethod[]>([]);
  /** Cuenta de fiado del cliente: "Fiado" solo aparece si tiene cupo, como en el POS (decisión 255). */
  protected readonly credit = signal<CreditAccount | null>(null);
  protected readonly lines = signal<PaymentDraft[]>([]);
  private idempotencyKey = '';
  private methodsRequested = false;
  protected readonly cop = formatCop;
  protected readonly size = sizeText;
  private readonly withholdingBox = viewChild(WithholdingBoxComponent);
  protected readonly withheld = signal<WithholdingResult>(NO_WITHHOLDING);
  private withholdingMethodId: string | null = null;

  /** Base e IVA de lo que paga ahora: lo entregado menos lo que cubre el anticipo, en proporción. */
  protected readonly bases = computed<TaxBases>(() => {
    const a = this.amounts();
    const all = sumBases(this.pending().filter((i) => this.chosen().has(i.id)));
    return proportionalBases(a.remaining, a.total, all.base, all.iva);
  }, { equal: (x, y) => x.base === y.base && x.iva === y.iva });

  /** Lo que se paga con plata (o fiado): lo que falta menos lo retenido. */
  protected toPay(): number {
    return Math.max(0, this.amounts().remaining - this.withheld().total);
  }

  protected onWithheld(result: WithholdingResult): void {
    this.withheld.set(result);
    const lines = this.lines();
    if (lines.length === 1) {
      this.lines.set([{ ...lines[0], amount: this.toPay() || null }]);
    }
  }

  /** Por defecto se entrega todo lo pendiente y se cobra el resto en efectivo. */
  prepare(order: Order): void {
    const pending = order.items.filter((i) => !i.delivered);
    this.pending.set(pending);
    this.chosen.set(new Set(pending.map((i) => i.id)));
    this.idempotencyKey = newIdempotencyKey('entrega');
    this.withholdingBox()?.reset();
    this.withheld.set(NO_WITHHOLDING);
    this.resetLines(this.amountsFor(order).remaining);
    this.credit.set(null);
    if (this.auth.hasPermission('credit:read')) {
      this.creditApi.account(order.customerId).subscribe({
        next: (account) => {
          if (this.order()?.customerId === account.customerId) {
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
            this.resetLines(this.amounts().remaining);
          }
        },
        error: () => (this.methodsRequested = false),
      });
    }
  }

  /** Una sola línea en efectivo por lo que falta. */
  private resetLines(remaining: number): void {
    const cash = this.methods().find((m) => m.affectsCash) ?? this.methods()[0];
    this.lines.set([newPaymentLine(cash, remaining)]);
  }

  toggle(item: OrderItem): void {
    const next = new Set(this.chosen());
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.add(item.id);
    }
    this.chosen.set(next);
    // Con un solo medio, el valor sigue a lo que hay que pagar (si quedó por debajo).
    const lines = this.lines();
    const remaining = this.toPay();
    if (lines.length === 1 && Number(lines[0].amount ?? 0) < remaining) {
      this.lines.set([{ ...lines[0], amount: remaining || null }]);
    }
  }

  /** Medios para cobrar el resto: "Fiado" solo si el cliente tiene cupo. */
  protected payMethods(): PaymentMethod[] {
    const canCredit = (this.credit()?.creditLimit ?? 0) > 0;
    return this.methods().filter((m) => m.code !== CREDIT_METHOD_CODE || canCredit);
  }

  protected creditAvailable(): number | null {
    const account = this.credit();
    return account && account.creditLimit > 0 ? account.available : null;
  }

  private amountsFor(order: Order) {
    return deliveryAmounts(order, this.chosen());
  }

  protected amounts() {
    const order = this.order();
    return order ? this.amountsFor(order) : { total: 0, applied: 0, remaining: 0, leftover: 0, completes: false };
  }

  protected problem(): string | null {
    const a = this.amounts();
    if (this.chosen().size === 0) {
      return 'Marca lo que vas a entregar.';
    }
    if (a.leftover > 0) {
      return `Quedarían ${formatCop(a.leftover)} de anticipo sin aplicar. Revisa los precios del pedido o cancela lo `
        + 'pendiente para devolverlos.';
    }
    if (a.remaining <= 0) {
      return null;
    }
    const retention = withholdingProblem(this.withheld());
    if (retention) {
      return retention;
    }
    if (this.withheld().total > a.remaining) {
      return 'La retención no puede ser mayor que lo que se cobra.';
    }
    return this.toPay() > 0 ? paymentLinesProblem(this.toPay(), this.lines(), this.payMethods(), this.creditAvailable())
      : null;
  }

  protected readonly saveRequest = (): Observable<OrderDelivery> => {
    const order = this.order()!;
    const payments = this.amounts().remaining > 0 && this.toPay() > 0
      ? toPaymentRequests(this.lines(), this.payMethods()) : [];
    const retention = this.amounts().remaining > 0 ? withholdingPayment(this.withholdingMethodId, this.withheld()) : null;
    if (retention) {
      payments.push(retention);
    }
    const itemIds = this.pending().filter((i) => this.chosen().has(i.id)).map((i) => i.id);
    return this.api.deliver(order.id, itemIds, payments, this.idempotencyKey)
      .pipe(tap(() => (this.idempotencyKey = newIdempotencyKey('entrega'))));
  };
}
