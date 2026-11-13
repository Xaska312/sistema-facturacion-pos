import { Component, OnInit, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ButtonLinkComponent } from '../../shared/ui/button-link.component';
import { PurchaseReceipt, PurchasesApi, SupplierPayment } from '../../core/api/purchases.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { formatDateTime } from '../../shared/format';
import { formatCop, formatQuantity } from '../../shared/money';
import { saveDownload } from '../../shared/download';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { formatDay, isoDay } from '../orders/order-text';
import { dueLabel, purchaseBadge, receiptNumber } from './purchase-text';
import { PurchaseReturnDialogComponent } from './purchase-return-dialog.component';
import { SupplierPaymentDialogComponent } from './supplier-payment-dialog.component';

/**
 * Una recepción de mercancía (Fase 13-2, decisión 280): lo aceptado con su lote y vencimiento, lo rechazado con su
 * motivo, la revisión técnica, la temperatura de la nevera y los pagos. No se edita ni se borra: es el soporte ante la
 * inspección; una devolución posterior va por inventario.
 */
@Component({
  selector: 'app-receipt-detail',
  imports: [RouterLink, ButtonComponent, ButtonLinkComponent, PageHeaderComponent, StatusBadgeComponent, SupplierPaymentDialogComponent,
    PurchaseReturnDialogComponent],
  template: `
    @if (receipt(); as r) {
      @let s = r.summary;
      <app-page-header [title]="'Recepción ' + number(s.number)"
                       [description]="(s.supplierName ?? '') + ' · factura ' + s.supplierInvoice + ' del ' + day(s.invoiceDate)">
        <a appButton routerLink="/app/compras" label="Compras" icon="pi pi-arrow-left" [text]="true" severity="secondary"></a>
        @if (canPay() && s.balance > 0) {
          <app-button label="Registrar pago" icon="pi pi-wallet" (clicked)="payDialog()?.open(s)" />
        }
        @if (r.document; as doc) {
          <app-button label="Factura del proveedor" icon="pi pi-download" severity="secondary" [outlined]="true"
                    [loading]="downloading()" (clicked)="downloadDocument(doc.id, doc.fileName)" />
        }
        @if (canReturn() && returnable()) {
          <app-button label="Devolver al proveedor" icon="pi pi-replay" severity="secondary" [outlined]="true"
                    (clicked)="returnDialog()?.open(r)" />
        }
      </app-page-header>

      <section class="card p-4 max-w-5xl grid gap-3 md:grid-cols-4 text-sm">
        <div>
          <span class="block text-xs text-muted">Estado</span>
          <app-status-badge [status]="badge(s).key" [label]="badge(s).label" />
        </div>
        <div>
          <span class="block text-xs text-muted">{{ s.paymentType === 'CREDIT' ? 'Crédito' : 'De contado' }}</span>
          @if (s.paymentType === 'CREDIT' && s.dueDate) {
            <span>{{ day(s.dueDate) }}</span>
            @if (s.balance > 0) {
              <span class="block text-xs" [class.text-danger]="s.overdue" [class.text-muted]="!s.overdue">{{ due(s.dueDate) }}</span>
            }
          } @else {
            <span>Pagada al recibir</span>
          }
        </div>
        <div>
          <span class="block text-xs text-muted">Recibió</span>
          <span>{{ s.receivedByName ?? '—' }}</span>
          <span class="block text-xs text-muted">{{ when(s.receivedAt) }} · {{ s.branchName }}</span>
        </div>
        <div class="md:text-right">
          <span class="block text-xs text-muted">Total · saldo</span>
          <span class="font-semibold tabular-nums">{{ cop(s.total) }}</span>
          <span class="block tabular-nums" [class.text-danger]="s.balance > 0">{{ cop(s.balance) }}</span>
        </div>
      </section>

      <section class="card p-4 mt-4 max-w-5xl">
        <h2 class="font-bold tracking-tight mb-2">Productos</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <caption class="sr-only">Productos de la recepción</caption>
            <thead class="bg-surface-alt text-left">
              <tr>
                <th class="p-2">Producto</th>
                <th class="p-2 text-right">Cantidad</th>
                <th class="p-2">Lote · vence</th>
                <th class="p-2 text-right">Costo sin IVA</th>
                <th class="p-2 text-right">IVA</th>
                <th class="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (l of r.lines; track l.lineNo) {
                <tr class="border-t" [class.text-muted]="l.status === 'REJECTED'">
                  <td class="p-2">
                    <span class="font-mono">{{ l.sku }}</span> {{ l.productName }}
                    @if (l.sanitaryRegistration) {
                      <span class="block text-xs text-muted">{{ l.sanitaryRegistration }}</span>
                    }
                    @if (l.status === 'REJECTED') {
                      <span class="block text-xs text-danger">Rechazado: {{ l.rejectReason }}</span>
                    }
                    @if (l.returnedQuantity > 0) {
                      <span class="block text-xs text-warning">Devuelto: {{ q(l.returnedQuantity) }} {{ l.unitCode }}</span>
                    }
                  </td>
                  <td class="p-2 text-right tabular-nums">{{ q(l.quantity) }} {{ l.unitCode }}</td>
                  <td class="p-2">{{ l.lotNumber ?? '—' }}@if (l.expirationDate) { · {{ day(l.expirationDate) }} }</td>
                  <td class="p-2 text-right tabular-nums">{{ cop(l.unitCost) }}</td>
                  <td class="p-2 text-right tabular-nums">{{ l.taxRate }} %</td>
                  <td class="p-2 text-right tabular-nums" [class.line-through]="l.status === 'REJECTED'">{{ cop(l.lineTotal) }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="border-t"><td colspan="5" class="p-2 text-right">Subtotal</td><td class="p-2 text-right tabular-nums">{{ cop(r.subtotal) }}</td></tr>
              <tr><td colspan="5" class="p-2 text-right">IVA</td><td class="p-2 text-right tabular-nums">{{ cop(r.taxTotal) }}</td></tr>
              <tr class="font-semibold"><td colspan="5" class="p-2 text-right">Total</td><td class="p-2 text-right tabular-nums">{{ cop(s.total) }}</td></tr>
              @if (s.returnedTotal > 0) {
                <tr class="text-muted"><td colspan="5" class="p-2 text-right">Devuelto al proveedor</td><td class="p-2 text-right tabular-nums">-{{ cop(s.returnedTotal) }}</td></tr>
              }
              @if (s.rejectedTotal > 0) {
                <tr class="text-muted"><td colspan="5" class="p-2 text-right">Rechazado (no se debe)</td><td class="p-2 text-right tabular-nums">{{ cop(s.rejectedTotal) }}</td></tr>
              }
            </tfoot>
          </table>
        </div>
      </section>

      <section class="card p-4 mt-4 max-w-5xl grid gap-2 md:grid-cols-2 text-sm">
        <p><span class="pi pi-check-circle text-success" aria-hidden="true"></span>
          Revisión técnica confirmada por {{ s.receivedByName ?? '—' }}.</p>
        @if (r.coldChainTemperature !== null) {
          <p><span class="pi pi-sun text-info" aria-hidden="true"></span> Nevera: llegó a {{ r.coldChainTemperature }} °C.</p>
        }
        @if (r.notes) {
          <p class="md:col-span-2"><span class="text-muted">Notas:</span> {{ r.notes }}</p>
        }
      </section>

      @if (r.returns.length > 0) {
        <section class="card p-4 mt-4 max-w-5xl">
          <h2 class="font-bold tracking-tight mb-2">Devoluciones al proveedor</h2>
          @for (d of r.returns; track d.id) {
            <div class="text-sm border-t first:border-t-0 py-2">
              <p class="flex flex-wrap justify-between gap-2">
                <span>{{ when(d.createdAt) }} · {{ d.reason }} · {{ d.createdByName ?? '—' }}</span>
                <span class="tabular-nums font-medium">-{{ cop(d.total) }}</span>
              </p>
              <p class="text-xs text-muted">
                @for (l of d.lines; track l.receiptLineNo; let last = $last) {
                  {{ l.productName }} {{ q(l.quantity) }} {{ l.unitCode }}{{ l.lotNumber ? ' (lote ' + l.lotNumber + ')' : '' }}{{ last ? '' : ' · ' }}
                }
              </p>
            </div>
          }
        </section>
      }

      <section class="card p-4 mt-4 max-w-5xl">
        <h2 class="font-bold tracking-tight mb-2">Pagos</h2>
        @for (p of r.payments; track p.id) {
          <p class="flex flex-wrap justify-between gap-2 text-sm border-t first:border-t-0 py-2">
            <span>{{ when(p.paidAt) }} · {{ p.methodName }}{{ p.fromCash ? ' (de la caja)' : '' }}
              {{ p.reference ? ' · ' + p.reference : '' }} · {{ p.paidByName ?? '—' }}</span>
            <span class="tabular-nums font-medium">{{ cop(p.amount) }}</span>
          </p>
        } @empty {
          <p class="text-sm text-muted">Aún no tiene pagos.</p>
        }
      </section>

      <app-supplier-payment-dialog (paid)="onPaid($event)" />
      <app-purchase-return-dialog (returned)="onReturned($event)" />
    } @else {
      <p class="text-muted p-4">Cargando…</p>
    }
  `,
})
export class ReceiptDetailComponent implements OnInit {
  /** Parámetro de ruta :id. */
  readonly id = input.required<string>();

  private readonly api = inject(PurchasesApi);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  protected readonly canPay = permissionFlag('purchases:pay');
  protected readonly payDialog = viewChild(SupplierPaymentDialogComponent);
  protected readonly returnDialog = viewChild(PurchaseReturnDialogComponent);
  protected readonly canReturn = permissionFlag('purchases:receive');
  protected readonly receipt = signal<PurchaseReceipt | null>(null);
  protected readonly downloading = signal(false);

  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly day = formatDay;
  protected readonly when = formatDateTime;
  protected readonly number = receiptNumber;
  protected readonly badge = purchaseBadge;

  ngOnInit(): void {
    this.load();
  }

  protected due(dueDate: string): string {
    return dueLabel(dueDate, isoDay(new Date()));
  }

  private load(): void {
    this.api.get(this.id()).subscribe({
      next: (r) => this.receipt.set(r),
      error: () => void this.router.navigate(['/app/compras']),
    });
  }

  /** La factura que se cargó al recibir (decisión 290), tal como la mandó el proveedor. */
  protected downloadDocument(id: string, fileName: string): void {
    this.downloading.set(true);
    this.api.documentFile(id).subscribe({
      next: (response) => {
        this.downloading.set(false);
        saveDownload(response, fileName);
      },
      error: () => this.downloading.set(false),
    });
  }

  /** Queda algo aceptado sin devolver. */
  protected returnable(): boolean {
    return (this.receipt()?.lines ?? []).some((l) => l.status === 'ACCEPTED' && l.quantity > (l.returnedQuantity ?? 0));
  }

  protected onReturned(receipt: PurchaseReceipt): void {
    this.messages.add({ severity: 'success', summary: 'Devolución registrada',
      detail: 'Salió del inventario y se descontó de lo que le debes al proveedor.', life: 4000 });
    this.receipt.set(receipt);
  }

  protected onPaid(payment: SupplierPayment): void {
    this.messages.add({ severity: 'success', summary: 'Pago registrado', detail: formatCop(payment.amount), life: 3000 });
    this.load();
  }
}
