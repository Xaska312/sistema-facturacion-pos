import { Component, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import {
  CREDIT_METHOD_CODE,
  DEPOSIT_METHOD_CODE,
  Order,
  OrderDelivery,
  OrderPayment,
  PaymentMethod,
} from '../../core/api/api.models';
import { BrandingApi, BusinessHeader } from '../../core/api/branding.api';
import { CashApi } from '../../core/api/cash.api';
import { OrdersApi } from '../../core/api/orders.api';
import { AuthService } from '../../core/auth/auth.service';
import { permissionFlag } from '../../core/auth/permission-flag';
import { BrandingService } from '../../core/theme/branding.service';
import { formatDateTime } from '../../shared/format';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { loadReceiptWidth, printReceipt } from '../../shared/receipt/receipt-prefs';
import { StatCardComponent } from '../../shared/stat-card.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { methodLabel } from '../pos/pos-labels';
import { OrderDeliverDialogComponent } from './order-deliver-dialog.component';
import { OrderPaymentDialogComponent } from './order-payment-dialog.component';
import { OrderDocumentComponent } from './order-document.component';
import { OrderReceiptComponent } from './order-receipt.component';
import { PAYMENT_LABEL, dueLabel, formatDay, orderBadge, orderWhatsAppLink, sizeText } from './order-text';

/**
 * Un pedido: qué pidió, entregas parciales, anticipos y lo que falta (decisión 258). Desde aquí se recibe un
 * anticipo, se entrega (todo o parte, como venta), se edita, se cancela y se imprime o envía el comprobante.
 */
@Component({
  selector: 'app-order-detail',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent, StatCardComponent,
    StatusBadgeComponent, FormDialogComponent, OrderPaymentDialogComponent, OrderDeliverDialogComponent,
    OrderReceiptComponent, OrderDocumentComponent],
  template: `
    <app-page-header [title]="order() ? 'Pedido ' + order()!.number : 'Pedido'" [description]="subtitle()">
      <a pButton routerLink="/app/pedidos" label="Todos los pedidos" icon="pi pi-arrow-left" severity="secondary"
         [outlined]="true"></a>
    </app-page-header>

    @if (order(); as o) {
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <app-status-badge [status]="badge(o).key" [label]="badge(o).label" />
        <span class="text-sm">Entrega: <strong>{{ day(o.dueDate) }}</strong>
          @if (o.status === 'OPEN') {
            <span [class.text-danger]="o.overdue" [class.text-muted]="!o.overdue"> · {{ due(o) }}</span>
          }
        </span>
        @if (o.status === 'CANCELLED') {
          <span class="text-sm text-muted">Cancelado el {{ dateTime(o.cancelledAt) }}: {{ o.cancelReason }}</span>
        }
      </div>

      <div class="grid gap-3 grid-cols-1 sm:grid-cols-3 mb-4">
        <app-stat-card label="Total del pedido" [value]="cop(o.total)" icon="pi pi-calendar"
                       [hint]="o.deliveredTotal > 0 ? 'Entregado ' + cop(o.deliveredTotal) : null" />
        <app-stat-card label="Abonado" [value]="cop(o.deposited)" icon="pi pi-inbox"
                       [hint]="o.depositAvailable > 0 ? 'Por aplicar ' + cop(o.depositAvailable) : null" />
        <app-stat-card label="Falta por pagar" [value]="cop(o.status === 'OPEN' ? o.balanceDue : 0)" icon="pi pi-wallet" />
      </div>

      <div class="flex flex-wrap gap-2 mb-4">
        @if (o.status === 'OPEN' && canCreate()) {
          @if (canSell()) {
            <p-button label="Entregar" icon="pi pi-check-circle" (onClick)="openDeliver()" />
          }
          @if (o.balanceDue > 0) {
            <p-button label="Recibir anticipo" icon="pi pi-dollar" severity="secondary" [outlined]="true"
                      (onClick)="openPayment()" />
          }
          <a pButton [routerLink]="['/app/pedidos', o.id, 'editar']" label="Editar" icon="pi pi-pencil"
             severity="secondary" [outlined]="true"></a>
        }
        <p-button label="Imprimir comprobante" icon="pi pi-print" severity="secondary" [outlined]="true"
                  (onClick)="print()" />
        <p-button label="Descargar PDF" icon="pi pi-file-pdf" severity="secondary" [outlined]="true"
                  (onClick)="printDocument()" />
        <a pButton label="Enviar por WhatsApp" icon="pi pi-whatsapp" severity="secondary" [outlined]="true"
           target="_blank" rel="noopener noreferrer" [href]="whatsApp(o)"
           [attr.aria-label]="'Enviar el comprobante a ' + o.customerName + ' por WhatsApp (abre WhatsApp)'"></a>
        @if (o.status === 'OPEN' && canManage()) {
          <p-button label="Cancelar pedido" icon="pi pi-ban" severity="danger" [text]="true" (onClick)="openCancel()" />
        }
        @if (o.status === 'CANCELLED' && o.depositAvailable > 0 && canManage()) {
          <p-button label="Devolver anticipo" icon="pi pi-replay" severity="danger" [outlined]="true"
                    (onClick)="openCancel()" />
        }
      </div>

      @if (o.status === 'CANCELLED' && o.depositAvailable > 0) {
        <p class="text-sm text-warning mb-4" role="status">
          Se anuló la venta de una entrega: hay {{ cop(o.depositAvailable) }} de anticipo por devolver al cliente.
        </p>
      }

      @if (o.address || o.notes) {
        <section class="card p-4 mb-4 text-sm flex flex-col gap-1">
          @if (o.address) {
            <p><span class="font-medium">Dirección:</span> {{ o.address }}</p>
          }
          @if (o.notes) {
            <p class="whitespace-pre-line"><span class="font-medium">Indicaciones:</span> {{ o.notes }}</p>
          }
        </section>
      }

      <section class="card p-4 mb-4">
        <h2 class="font-semibold mb-2">Qué pidió</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surface-alt text-left">
              <tr>
                <th class="p-2">Producto</th>
                <th class="p-2">Cantidad</th>
                <th class="p-2 text-right">Precio</th>
                <th class="p-2 text-right">Total</th>
                <th class="p-2">Entrega</th>
              </tr>
            </thead>
            <tbody>
              @for (item of o.items; track item.id) {
                <tr class="border-t">
                  <td class="p-2">
                    {{ item.productName }}
                    @if (item.description) {
                      <span class="block text-xs text-muted">{{ item.description }}</span>
                    }
                  </td>
                  <td class="p-2">{{ size(item) }}</td>
                  <td class="p-2 text-right tabular-nums">{{ cop(item.unitPrice) }}</td>
                  <td class="p-2 text-right tabular-nums">{{ cop(item.total) }}</td>
                  <td class="p-2">
                    @if (item.delivered) {
                      <span class="text-success font-medium">Entregado</span>
                      <span class="block text-xs text-muted">{{ dateTime(item.deliveredAt) }} · venta {{ item.saleNumber }}</span>
                    } @else {
                      <span class="text-muted">Pendiente</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card p-4">
        <h2 class="font-semibold mb-2">Anticipos y entregas</h2>
        @for (p of o.payments; track p.id) {
          <div class="flex flex-wrap justify-between gap-2 py-2 border-t first:border-t-0 text-sm">
            <span>
              <span class="font-medium">{{ paymentLabel(p) }}</span>
              <span class="block text-xs text-muted">{{ paymentDetail(p) }}</span>
            </span>
            <span class="tabular-nums" [class.text-success]="p.type === 'DEPOSIT'">
              {{ p.amount < 0 ? '−' : '+' }}{{ cop(abs(p.amount)) }}
            </span>
          </div>
        } @empty {
          <p class="text-sm text-muted">Aún no hay anticipos.</p>
        }
      </section>

      <app-order-receipt class="receipt-print-root" [order]="o" [businessName]="businessName()" [width]="width"
                         [logo]="brandLogo()" />
      <app-order-document class="receipt-print-root order-doc-root" [order]="o" [header]="header()"
                          [businessName]="businessName()" [logo]="brandLogo()" />
    }

    <app-order-payment-dialog [(visible)]="paymentOpen" [order]="order()" (paid)="paid($event)" />
    <app-order-deliver-dialog [(visible)]="deliverOpen" [order]="order()" (delivered)="deliveredDone($event)" />

    <app-form-dialog [(visible)]="cancelOpen" [header]="refundOnly() ? 'Devolver anticipo' : 'Cancelar pedido'"
                     width="28rem" [submitLabel]="refundOnly() ? 'Devolver anticipo' : 'Cancelar pedido'"
                     submitIcon="pi pi-ban" [destructive]="true" [dirty]="cancelReason.trim().length > 0"
                     [invalidMessage]="cancelProblem()" [save]="cancelRequest" [successMessage]="null"
                     (saved)="cancelled($any($event))"
                     [description]="refundOnly() ? 'El pedido ya está cancelado: se devuelve el anticipo que quedó disponible.'
                       : 'Lo ya entregado sigue siendo una venta. Lo pendiente se cancela.'">
      <div class="flex flex-col gap-1">
        <label for="cancel-reason" class="text-sm font-medium">{{ refundOnly() ? 'Nota de la devolución' : 'Motivo' }}</label>
        <input pInputText id="cancel-reason" maxlength="255" [(ngModel)]="cancelReason"
               [placeholder]="refundOnly() ? 'Devolución por la venta anulada' : 'El cliente desistió, no hubo material…'" />
      </div>
      @if ((order()?.depositAvailable ?? 0) > 0) {
        <fieldset class="flex flex-col gap-1">
          <legend class="text-sm font-medium mb-1">
            Devolver {{ cop(order()!.depositAvailable) }} de anticipo con
          </legend>
          <div class="flex flex-wrap gap-2">
            @for (m of refundMethods(); track m.id) {
              <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer"
                     [class.border-brand]="refundMethodId === m.id">
                <input type="radio" name="refund-method" [value]="m.id" [(ngModel)]="refundMethodId" />
                {{ label(m) }}
              </label>
            }
          </div>
          <small class="text-xs text-muted">En efectivo sale de tu caja abierta.</small>
        </fieldset>
        @if (refundNeedsReference()) {
          <div class="flex flex-col gap-1">
            <label for="refund-reference" class="text-sm font-medium">
              Referencia
              @if (!refundRequiresReference()) {
                <span class="text-muted font-normal">(opcional)</span>
              }
            </label>
            <input pInputText id="refund-reference" maxlength="60" [(ngModel)]="refundReference" />
          </div>
        }
      }
    </app-form-dialog>
  `,
})
export class OrderDetailComponent {
  /** Parámetro de ruta :id. */
  readonly id = input.required<string>();
  /** ?anticipo=1: recién creado, se abre el anticipo de una vez. */
  readonly anticipo = input<string>();

  private readonly api = inject(OrdersApi);
  private readonly cash = inject(CashApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);
  private readonly paymentDialog = viewChild(OrderPaymentDialogComponent);
  private readonly deliverDialog = viewChild(OrderDeliverDialogComponent);
  protected readonly brandLogo = inject(BrandingService).logo;
  protected readonly canCreate = permissionFlag('orders:create');
  protected readonly canManage = permissionFlag('orders:manage');
  /** Entregar registra una venta: también hace falta poder vender. */
  protected readonly canSell = permissionFlag('sales:create');

  protected readonly order = signal<Order | null>(null);
  /** Encabezado de la hoja carta (nombre, dirección y teléfono del negocio). */
  protected readonly header = signal<BusinessHeader | null>(null);
  protected readonly refundMethods = signal<PaymentMethod[]>([]);
  protected paymentOpen = false;
  protected deliverOpen = false;
  protected cancelOpen = false;
  protected cancelReason = '';
  protected refundMethodId = '';
  protected refundReference = '';
  protected readonly width = loadReceiptWidth();
  private openDeposit = false;

  protected readonly cop = formatCop;
  protected readonly abs = Math.abs;
  protected readonly day = formatDay;
  protected readonly dateTime = formatDateTime;
  protected readonly size = sizeText;

  constructor() {
    inject(BrandingApi).header().subscribe({ next: (h) => this.header.set(h), error: () => undefined });
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.order.set(null);
        this.openDeposit = this.anticipo() === '1';
        this.load(id);
      });
    });
  }

  private load(id: string): void {
    this.api.get(id).subscribe((order) => {
      if (this.id() !== id) {
        return;
      }
      this.order.set(order);
      if (this.openDeposit) {
        this.openDeposit = false;
        // Sin el parámetro en la URL, recargar no vuelve a abrir el anticipo.
        void this.router.navigate([], { queryParams: { anticipo: null }, queryParamsHandling: 'merge', replaceUrl: true });
        if (order.status === 'OPEN' && order.balanceDue > 0 && this.canCreate()) {
          // Tras crear el pedido: el diálogo necesita estar en pantalla (el @if de la orden).
          setTimeout(() => this.openPayment(), 0);
        }
      }
    });
  }

  protected subtitle(): string | null {
    const o = this.order();
    return o ? `${o.customerName} · ${o.customerDocument}${o.customerPhone ? ' · ' + o.customerPhone : ''}` : null;
  }

  protected badge(order: Order) {
    return orderBadge(order);
  }

  protected due(order: Order): string {
    return dueLabel(order.dueDate, new Date(), order.overdue);
  }

  protected businessName(): string {
    return this.auth.currentTenant()?.tradeName ?? '';
  }

  protected whatsApp(order: Order): string {
    return orderWhatsAppLink(order, this.businessName() || 'tu tienda');
  }

  protected paymentLabel(payment: OrderPayment): string {
    return PAYMENT_LABEL[payment.type];
  }

  protected paymentDetail(payment: OrderPayment): string {
    const parts = [formatDateTime(payment.createdAt)];
    if (payment.type === 'DEPOSIT' || payment.type === 'REFUND') {
      parts.push(payment.methodName ?? '');
      if (payment.reference) {
        parts.push(`ref. ${payment.reference}`);
      }
    } else if (payment.saleNumber) {
      parts.push(`venta ${payment.saleNumber}`);
    }
    if (payment.notes) {
      parts.push(payment.notes);
    }
    if (payment.createdByName) {
      parts.push(payment.createdByName);
    }
    return parts.filter((p) => p).join(' · ');
  }

  protected label(method: PaymentMethod): string {
    return methodLabel(method.code, method.name);
  }

  print(): void {
    printReceipt();
  }

  /** Hoja carta: en el diálogo de impresión se elige "Guardar como PDF" para enviarla por WhatsApp o correo. */
  printDocument(): void {
    printReceipt('.order-doc-root');
  }

  openPayment(): void {
    const order = this.order();
    if (order) {
      this.paymentDialog()?.prepare(order);
      this.paymentOpen = true;
    }
  }

  paid(order: Order): void {
    this.order.set(order);
    this.messages.add({
      severity: 'success',
      summary: 'Anticipo registrado',
      detail: order.balanceDue > 0 ? `Falta por pagar ${formatCop(order.balanceDue)}.` : 'Quedó pagado.',
      life: 4000,
    });
  }

  openDeliver(): void {
    const order = this.order();
    if (order) {
      this.deliverDialog()?.prepare(order);
      this.deliverOpen = true;
    }
  }

  deliveredDone(result: OrderDelivery): void {
    this.order.set(result.order);
    const sale = result.order.items.find((i) => i.saleId === result.saleId)?.saleNumber;
    this.messages.add({
      severity: 'success',
      summary: result.order.status === 'DELIVERED' ? 'Pedido entregado' : 'Entrega registrada',
      detail: sale ? `Se registró la venta ${sale}. La encuentras en Ventas para imprimir el tiquete.` : undefined,
      life: 6000,
    });
  }

  openCancel(): void {
    this.cancelReason = '';
    this.refundReference = '';
    this.refundMethodId = '';
    this.cancelOpen = true;
    if (this.refundMethods().length === 0) {
      this.cash.paymentMethods().subscribe((list) => {
        const usable = list.filter((m) => m.code !== CREDIT_METHOD_CODE && m.code !== DEPOSIT_METHOD_CODE);
        this.refundMethods.set(usable);
        this.refundMethodId ||= usable.find((m) => m.affectsCash)?.id ?? usable[0]?.id ?? '';
      });
    } else {
      this.refundMethodId = this.refundMethods().find((m) => m.affectsCash)?.id ?? this.refundMethods()[0]?.id ?? '';
    }
  }

  protected refundNeedsReference(): boolean {
    const method = this.refundMethods().find((m) => m.id === this.refundMethodId);
    return !!method && !method.affectsCash;
  }

  protected refundRequiresReference(): boolean {
    const method = this.refundMethods().find((m) => m.id === this.refundMethodId);
    return !!method && !method.affectsCash && method.requiresReference;
  }

  protected cancelProblem(): string | null {
    if (!this.cancelReason.trim()) {
      return this.refundOnly() ? 'Escribe una nota de la devolución.' : 'Escribe el motivo de la cancelación.';
    }
    if ((this.order()?.depositAvailable ?? 0) > 0 && !this.refundMethodId) {
      return 'Elige cómo devuelves el anticipo.';
    }
    if ((this.order()?.depositAvailable ?? 0) > 0 && this.refundRequiresReference() && !this.refundReference.trim()) {
      return 'Escribe la referencia de la devolución.';
    }
    return null;
  }

  /** Pedido ya cancelado con anticipo por devolver (se anuló la venta de una entrega). */
  protected refundOnly(): boolean {
    return this.order()?.status === 'CANCELLED';
  }

  protected readonly cancelRequest = (): Observable<Order> => {
    const order = this.order()!;
    const refund = order.depositAvailable > 0;
    const summary = this.refundOnly() ? 'Anticipo devuelto' : 'Pedido cancelado';
    return this.api.cancel(order.id, this.cancelReason.trim(), refund ? this.refundMethodId : null,
      refund && this.refundNeedsReference() ? this.refundReference.trim() || null : null)
      .pipe(tap(() => this.messages.add({ severity: 'success', summary, life: 3000 })));
  };

  cancelled(order: Order): void {
    this.order.set(order);
  }
}
