import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../shared/ui/toast.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { Payables, PurchaseSummary, PurchasesApi, SupplierPayment } from '../../core/api/purchases.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { formatDay, isoDay } from '../orders/order-text';
import { dueLabel, purchaseBadge, receiptNumber } from './purchase-text';
import { SupplierPaymentDialogComponent } from './supplier-payment-dialog.component';

/**
 * Cuentas por pagar (Fase 13-2, decisión 280): las facturas de proveedores con saldo, primero las que vencen antes.
 * Arriba, cuánto se debe, cuánto está vencido y cuánto vence en los próximos 7 días.
 */
@Component({
  selector: 'app-payables',
  imports: [RouterLink, ButtonComponent, PageHeaderComponent, StatusBadgeComponent, SupplierPaymentDialogComponent],
  template: `
    <app-page-header title="Cuentas por pagar"
                     description="Lo que les debes a tus proveedores por compras a crédito. Registra cada pago o abono aquí." />

    @if (data(); as d) {
      <section class="grid gap-3 sm:grid-cols-3 max-w-5xl">
        <article class="card p-4">
          <span class="block text-xs text-muted">Debes en total</span>
          <span class="text-2xl font-bold tabular-nums">{{ cop(d.totalDue) }}</span>
        </article>
        <article class="card p-4">
          <span class="block text-xs text-muted">Vencido</span>
          <span class="text-2xl font-bold tabular-nums" [class.text-danger]="d.overdue > 0">{{ cop(d.overdue) }}</span>
        </article>
        <article class="card p-4">
          <span class="block text-xs text-muted">Vence en los próximos 7 días</span>
          <span class="text-2xl font-bold tabular-nums" [class.text-warning]="d.dueSoon > 0">{{ cop(d.dueSoon) }}</span>
        </article>
      </section>

      <section class="card mt-4 max-w-5xl overflow-x-auto">
        <table class="w-full text-sm">
          <caption class="sr-only">Facturas con saldo</caption>
          <thead class="bg-surface-alt text-left">
            <tr>
              <th class="p-3">Proveedor</th>
              <th class="p-3">Vence</th>
              <th class="p-3">Estado</th>
              <th class="p-3 text-right">Total</th>
              <th class="p-3 text-right">Saldo</th>
              <th class="p-3"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of d.receipts; track r.id) {
              <tr class="border-t">
                <td class="p-3">
                  <span class="font-medium">{{ r.supplierName }}</span>
                  <a class="block text-xs text-brand hover:underline" [routerLink]="['/app/compras', r.id]">
                    Factura {{ r.supplierInvoice }} · {{ number(r.number) }}</a>
                </td>
                <td class="p-3">
                  <span>{{ day(r.dueDate) }}</span>
                  <span class="block text-xs" [class.text-danger]="r.overdue" [class.text-muted]="!r.overdue">{{ due(r.dueDate) }}</span>
                </td>
                <td class="p-3"><app-status-badge [status]="badge(r).key" [label]="badge(r).label" /></td>
                <td class="p-3 text-right tabular-nums">{{ cop(r.total) }}</td>
                <td class="p-3 text-right tabular-nums font-semibold">{{ cop(r.balance) }}</td>
                <td class="p-3 text-right">
                  @if (canPay()) {
                    <app-button label="Pagar" size="small" [text]="true" icon="pi pi-wallet" (clicked)="pay(r)" />
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="p-8 text-center text-muted">No les debes nada a tus proveedores.</td></tr>
            }
          </tbody>
        </table>
      </section>
    } @else {
      <p class="text-muted p-4">Cargando…</p>
    }

    <app-supplier-payment-dialog (paid)="onPaid($event)" />
  `,
})
export class PayablesComponent implements OnInit {
  private readonly api = inject(PurchasesApi);
  private readonly messages = inject(ToastService);
  protected readonly canPay = permissionFlag('purchases:pay');
  private readonly dialog = viewChild(SupplierPaymentDialogComponent);
  protected readonly data = signal<Payables | null>(null);

  protected readonly cop = formatCop;
  protected readonly day = formatDay;
  protected readonly number = receiptNumber;
  protected readonly badge = purchaseBadge;

  ngOnInit(): void {
    this.load();
  }

  protected due(dueDate: string | null): string {
    return dueLabel(dueDate, isoDay(new Date()));
  }

  protected pay(receipt: PurchaseSummary): void {
    this.dialog()?.open(receipt);
  }

  protected onPaid(payment: SupplierPayment): void {
    this.messages.add({ severity: 'success', summary: 'Pago registrado', detail: formatCop(payment.amount), life: 3000 });
    this.load();
  }

  private load(): void {
    this.api.payables().subscribe((d) => this.data.set(d));
  }
}
