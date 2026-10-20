import { Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import {
  CREDIT_METHOD_CODE,
  CreditAccount,
  DEPOSIT_METHOD_CODE,
  Order,
  OrderDelivery,
  OrderItem,
  PaymentMethod,
} from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CreditApi } from '../../core/api/credit.api';
import { OrdersApi } from '../../core/api/orders.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop } from '../../shared/money';
import { methodLabel } from '../pos/pos-labels';
import { deliveryAmounts, sizeText } from './order-text';

/**
 * Entregar un pedido, todo o una parte (decisión 258): se registra una venta con lo entregado, en tu caja abierta.
 * La clave de idempotencia es la de la venta: reintentar no la duplica.
 */
@Component({
  selector: 'app-order-deliver-dialog',
  imports: [FormsModule, InputTextModule, PesosInputDirective, FormDialogComponent],
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
          <fieldset class="flex flex-col gap-1">
            <legend class="text-sm font-medium mb-1">Cómo paga</legend>
            <div class="flex flex-wrap gap-2">
              @for (m of payMethods(); track m.id) {
                <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer"
                       [class.border-brand]="methodId === m.id">
                  <input type="radio" name="deliver-method" [value]="m.id" [(ngModel)]="methodId"
                         (ngModelChange)="methodChanged()" />
                  {{ label(m) }}
                </label>
              }
            </div>
          </fieldset>
          @if (selected()?.affectsCash) {
            <div class="flex flex-col gap-1">
              <label for="deliver-tendered" class="text-sm font-medium">Recibe</label>
              <input id="deliver-tendered" appPesos class="h-12 border rounded-lg px-3 text-xl text-right tabular-nums"
                     [(ngModel)]="tendered" name="tendered" />
              @if (change() > 0) {
                <small class="text-sm font-medium">Cambio {{ cop(change()) }}</small>
              }
            </div>
          } @else if (isCredit()) {
            <small class="text-xs text-muted">
              Queda fiado a {{ o.customerName }}. Cupo disponible {{ cop(credit()?.available ?? 0) }}.
            </small>
          } @else if (selected()) {
            <div class="flex flex-col gap-1">
              <label for="deliver-reference" class="text-sm font-medium">
                Referencia
                @if (!selected()!.requiresReference) {
                  <span class="text-muted font-normal">(opcional)</span>
                }
              </label>
              <input pInputText id="deliver-reference" name="reference" maxlength="60" [(ngModel)]="reference" />
            </div>
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
  protected methodId = '';
  protected tendered: number | null = null;
  protected reference = '';
  private idempotencyKey = '';
  private methodsRequested = false;
  protected readonly cop = formatCop;
  protected readonly size = sizeText;

  /** Por defecto se entrega todo lo pendiente. */
  prepare(order: Order): void {
    const pending = order.items.filter((i) => !i.delivered);
    this.pending.set(pending);
    this.chosen.set(new Set(pending.map((i) => i.id)));
    this.reference = '';
    this.idempotencyKey = newIdempotencyKey('entrega');
    this.methodId = this.methods().find((m) => m.affectsCash)?.id ?? this.methods()[0]?.id ?? '';
    this.tendered = this.amountsFor(order).remaining || null;
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

  toggle(item: OrderItem): void {
    const next = new Set(this.chosen());
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.add(item.id);
    }
    this.chosen.set(next);
    this.fitTendered();
  }

  methodChanged(): void {
    this.fitTendered();
  }

  /** Lo recibido en efectivo se ajusta solo si quedó vacío o por debajo de lo que hay que pagar. */
  private fitTendered(): void {
    const remaining = this.amounts().remaining;
    if (this.tendered === null || Number(this.tendered) < remaining) {
      this.tendered = remaining || null;
    }
  }

  /** Medios para cobrar el resto: "Fiado" solo si el cliente tiene cupo. */
  protected payMethods(): PaymentMethod[] {
    const canCredit = (this.credit()?.creditLimit ?? 0) > 0;
    return this.methods().filter((m) => m.code !== CREDIT_METHOD_CODE || canCredit);
  }

  protected isCredit(): boolean {
    return this.selected()?.code === CREDIT_METHOD_CODE;
  }

  private amountsFor(order: Order) {
    return deliveryAmounts(order, this.chosen());
  }

  protected amounts() {
    const order = this.order();
    return order ? this.amountsFor(order) : { total: 0, applied: 0, remaining: 0, leftover: 0, completes: false };
  }

  protected selected(): PaymentMethod | undefined {
    return this.payMethods().find((m) => m.id === this.methodId);
  }

  protected label(method: PaymentMethod): string {
    return methodLabel(method.code, method.name);
  }

  protected change(): number {
    const remaining = this.amounts().remaining;
    const tendered = Number(this.tendered ?? 0);
    return this.selected()?.affectsCash && tendered > remaining ? tendered - remaining : 0;
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
    const method = this.selected();
    if (!method) {
      return 'Elige cómo paga el cliente.';
    }
    if (method.affectsCash && Number(this.tendered ?? 0) < a.remaining) {
      return `Recibe al menos ${formatCop(a.remaining)}.`;
    }
    if (method.requiresReference && !method.affectsCash && !this.isCredit() && !this.reference.trim()) {
      return 'Escribe la referencia del pago.';
    }
    return null;
  }

  protected readonly saveRequest = (): Observable<OrderDelivery> => {
    const order = this.order()!;
    const a = this.amounts();
    const method = this.selected();
    const payments = a.remaining > 0 && method ? [{
      paymentMethodId: method.id,
      amount: method.affectsCash ? Number(this.tendered) : a.remaining,
      reference: method.affectsCash || this.isCredit() ? null : this.reference.trim() || null,
    }] : [];
    const itemIds = this.pending().filter((i) => this.chosen().has(i.id)).map((i) => i.id);
    return this.api.deliver(order.id, itemIds, payments, this.idempotencyKey)
      .pipe(tap(() => (this.idempotencyKey = newIdempotencyKey('entrega'))));
  };
}
