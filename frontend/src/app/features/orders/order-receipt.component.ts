import { Component, input } from '@angular/core';
import { Order } from '../../core/api/api.models';
import { formatDay, sizeText } from './order-text';
import { formatDateTime } from '../../shared/format';
import { formatCop } from '../../shared/money';
import { ReceiptWidth } from '../../shared/receipt/receipt-prefs';

/**
 * Comprobante de un pedido por encargo (decisión 258) para la impresora térmica o PDF: qué pidió, fecha de entrega,
 * lo abonado y lo que falta. No es una factura: la venta se registra al entregar. Con la clase
 * {@code receipt-print-root} es el área de impresión.
 */
@Component({
  selector: 'app-order-receipt',
  template: `
    @let o = order();
    <div class="receipt" [class.receipt-58]="width() === 58" [style.width.mm]="width()">
      @if (logo(); as src) {
        <img [src]="src" alt="" class="logo" />
      }
      <p class="center bold">{{ businessName() }}</p>
      <p class="center bold mt">Pedido {{ o.number }}</p>
      <p>Fecha: {{ dateTime(o.createdAt) }}</p>
      <p>Cliente: {{ o.customerName }}</p>
      <p>{{ o.customerDocument }}{{ o.customerPhone ? ' · Tel. ' + o.customerPhone : '' }}</p>
      @if (o.status === 'CANCELLED') {
        <p class="center bold mt">*** PEDIDO CANCELADO ***</p>
      }
      <hr />
      @for (item of o.items; track item.id) {
        <p>{{ item.productName }}{{ item.description ? ' · ' + item.description : '' }}</p>
        <p class="row">
          <span>{{ size(item) }}{{ item.delivered ? ' (entregado)' : '' }}</span>
          <span>{{ cop(item.total) }}</span>
        </p>
      }
      <hr />
      <p class="row bold big"><span>TOTAL</span><span>{{ cop(o.total) }}</span></p>
      <p class="row"><span>Abonado</span><span>{{ cop(o.deposited) }}</span></p>
      @if (o.status === 'OPEN') {
        <p class="row bold"><span>Falta por pagar</span><span>{{ cop(o.balanceDue) }}</span></p>
        <hr />
        <p class="bold">Entrega: {{ day(o.dueDate) }}</p>
      }
      @if (o.address) {
        <p>Dirección: {{ o.address }}</p>
      }
      @if (o.notes) {
        <p>Indicaciones: {{ o.notes }}</p>
      }
      <hr />
      <p class="center small">Comprobante de pedido · no es factura</p>
    </div>
  `,
  styles: `
    .receipt { font-family: ui-monospace, 'Courier New', monospace; font-size: 12px; line-height: 1.3; color: #000;
      background: #fff; padding: 3mm; box-sizing: border-box; }
    .receipt-58 { font-size: 10px; }
    p { margin: 0; overflow-wrap: anywhere; white-space: pre-line; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .row span:last-child { white-space: nowrap; }
    .center { text-align: center; }
    .logo { display: block; margin: 0 auto 4px; max-width: 70%; max-height: 18mm; object-fit: contain; filter: grayscale(1); }
    .bold { font-weight: 700; }
    .big { font-size: 1.15em; }
    .small { font-size: 0.85em; }
    .mt { margin-top: 4px; }
    hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  `,
})
export class OrderReceiptComponent {
  readonly order = input.required<Order>();
  readonly businessName = input('');
  readonly width = input<ReceiptWidth>(80);
  readonly logo = input<string | null>(null);

  protected readonly cop = formatCop;
  protected readonly day = formatDay;
  protected readonly dateTime = formatDateTime;
  protected readonly size = sizeText;
}
