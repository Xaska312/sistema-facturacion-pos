import { Component, computed, input } from '@angular/core';
import { Sale } from '../../core/api/api.models';
import { formatCop, formatQuantity } from '../money';
import { ReceiptWidth } from './receipt-prefs';

/**
 * Tiquete de venta para impresora térmica de 58 u 80 mm. El mismo componente sirve de vista previa y, con la
 * clase {@code receipt-print-root}, de área de impresión (@media print en styles.css).
 */
@Component({
  selector: 'app-receipt',
  template: `
    @let s = sale();
    <div class="receipt" [class.receipt-58]="width() === 58" [style.width.mm]="width()">
      <p class="center bold">{{ s.receipt.businessName }}</p>
      @if (s.receipt.branchName) {
        <p class="center">{{ s.receipt.branchName }}</p>
      }
      @if (s.receipt.branchAddress) {
        <p class="center">{{ s.receipt.branchAddress }}</p>
      }
      @if (s.receipt.branchPhone) {
        <p class="center">Tel. {{ s.receipt.branchPhone }}</p>
      }
      <p class="center bold mt">Tiquete {{ s.documentNumber }}</p>
      <p>{{ date() }}</p>
      <p>Caja {{ s.receipt.registerCode }} · {{ s.createdByName }}</p>
      <p>Cliente: {{ s.customerName }}</p>
      <p>{{ s.customerDocumentType }} {{ document() }}</p>
      @if (s.status === 'VOIDED') {
        <p class="center bold mt">*** VENTA ANULADA ***</p>
        <p class="center">{{ s.voidReason }}</p>
      }
      <hr />
      @for (item of s.items; track item.lineNo) {
        <p>{{ item.name }}</p>
        <p class="row">
          <span>{{ q(item.quantity) }} {{ item.unitCode }} × {{ cop(item.unitPrice) }}</span>
          <span>{{ cop(item.grossAmount) }}</span>
        </p>
        @if (item.discountAmount > 0) {
          <p class="row"><span>  Desc. {{ q(item.discountPercent) }} %</span><span>-{{ cop(item.discountAmount) }}</span></p>
        }
      }
      <hr />
      @if (s.discountTotal > 0) {
        <p class="row"><span>Descuentos</span><span>-{{ cop(s.discountTotal) }}</span></p>
      }
      <p class="row"><span>Subtotal (base)</span><span>{{ cop(s.subtotal) }}</span></p>
      @for (t of s.taxes; track t.taxId) {
        @if (t.taxAmount > 0) {
          <p class="row"><span>{{ t.taxType }} {{ q(t.taxRate) }} %</span><span>{{ cop(t.taxAmount) }}</span></p>
        }
      }
      <p class="row bold big"><span>TOTAL</span><span>{{ cop(s.total) }}</span></p>
      <hr />
      @for (p of s.payments; track p.lineNo) {
        <p class="row"><span>{{ p.methodName }}</span><span>{{ cop(p.tendered) }}</span></p>
      }
      @if (s.changeAmount > 0) {
        <p class="row bold"><span>Cambio</span><span>{{ cop(s.changeAmount) }}</span></p>
      }
      <hr />
      @if (s.receipt.footer) {
        <p class="center">{{ s.receipt.footer }}</p>
      }
      <p class="center small">Comprobante interno de venta</p>
    </div>
  `,
  styles: `
    .receipt { font-family: ui-monospace, 'Courier New', monospace; font-size: 12px; line-height: 1.3; color: #000;
      background: #fff; padding: 3mm; box-sizing: border-box; }
    .receipt-58 { font-size: 10px; }
    p { margin: 0; overflow-wrap: anywhere; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .row span:last-child { white-space: nowrap; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .big { font-size: 1.15em; }
    .small { font-size: 0.85em; }
    .mt { margin-top: 4px; }
    hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  `,
})
export class ReceiptComponent {
  readonly sale = input.required<Sale>();
  readonly width = input<ReceiptWidth>(80);

  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;

  protected readonly date = computed(() => {
    const s = this.sale();
    try {
      return new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: s.receipt.timezone ?? undefined,
      }).format(new Date(s.createdAt));
    } catch {
      return new Date(s.createdAt).toLocaleString('es-CO');
    }
  });

  protected readonly document = computed(() => {
    const s = this.sale();
    return s.customerVerificationDigit === null
      ? s.customerDocumentNumber
      : `${s.customerDocumentNumber}-${s.customerVerificationDigit}`;
  });
}
