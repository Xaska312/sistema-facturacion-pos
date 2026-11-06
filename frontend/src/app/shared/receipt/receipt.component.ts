import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { Sale } from '../../core/api/api.models';
import { formatCop, formatQuantity } from '../money';
import { ReceiptWidth, printableMm } from './receipt-prefs';
import { documentShortLabel } from '../document-types';
import { splitSummary } from './split-receipt';

/**
 * Tiquete de venta para impresora térmica de 58 u 80 mm. El mismo componente sirve de vista previa y, con la
 * clase {@code receipt-print-root}, de área de impresión (@media print en styles.css). Se arma al ancho imprimible
 * (72 o 48 mm) y con letra sin serifas gruesa: el driver convierte la página en puntos y una letra delgada sale
 * gris claro en algunas impresoras (decisión 289).
 */
@Component({
  selector: 'app-receipt',
  imports: [NgTemplateOutlet],
  template: `
    @let s = sale();
    <div class="receipt" [class.receipt-58]="width() === 58" [style.width.mm]="printable()">
      @if (logo(); as src) {
        <img [src]="src" alt="" class="logo" />
      }
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
      @if (split(); as sp) {
        <!-- Cobro partido entre cajas (decisión 294): una venta por carta, un solo tiquete. -->
        <p class="center bold mt">{{ s.notes ?? 'Cuenta' }}</p>
        <p>{{ date() }}</p>
        <p>Caja {{ s.receipt.registerCode }} · {{ s.createdByName }}</p>
        <p>Cliente: {{ s.customerName }}</p>
        <p>{{ shortDocType() }} {{ document() }}</p>
        @for (part of sp.parts; track part.id) {
          <hr />
          <p class="center bold">{{ part.splitLabel }} · Tiquete {{ part.documentNumber }}</p>
          @if (part.status === 'VOIDED') {
            <p class="center bold">*** ANULADA ***</p>
          }
          <ng-container *ngTemplateOutlet="lines; context: { $implicit: part }" />
          @for (t of part.taxes; track t.taxId) {
            @if (t.taxAmount > 0) {
              <p class="row"><span>{{ t.taxType }} {{ q(t.taxRate) }} %</span><span>{{ cop(t.taxAmount) }}</span></p>
            }
          }
          <p class="row bold"><span>Total {{ part.splitLabel }}</span><span>{{ cop(part.total) }}</span></p>
        }
        <hr />
        <p class="row bold big"><span>TOTAL</span><span>{{ cop(sp.total) }}</span></p>
        @if (sp.tip; as tip) {
          <p class="row mt"><span>Propina voluntaria ({{ tip.methodName }}){{ tip.voided ? ' ANULADA' : '' }}</span><span>{{ cop(tip.amount) }}</span></p>
          <p class="row bold"><span>Total con propina</span><span>{{ cop(sp.total + (tip.voided ? 0 : tip.amount)) }}</span></p>
        }
        <hr />
        @for (p of sp.payments; track p.methodName) {
          <p class="row"><span>{{ p.methodName }}</span><span>{{ cop(p.tendered) }}</span></p>
        }
        @if (sp.change > 0) {
          <p class="row bold"><span>Cambio</span><span>{{ cop(sp.change) }}</span></p>
        }
      } @else {
        <p class="center bold mt">Tiquete {{ s.documentNumber }}</p>
        <p>{{ date() }}</p>
        <p>Caja {{ s.receipt.registerCode }} · {{ s.createdByName }}</p>
        <p>Cliente: {{ s.customerName }}</p>
        <p>{{ shortDocType() }} {{ document() }}</p>
        @if (s.status === 'VOIDED') {
          <p class="center bold mt">*** VENTA ANULADA ***</p>
          <p class="center">{{ s.voidReason }}</p>
        }
        <hr />
        <ng-container *ngTemplateOutlet="lines; context: { $implicit: s }" />
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
        <!-- Propina voluntaria (Fase 12b-5; ley 1935 de 2018): aparte de la venta y sin impuestos. -->
        @if (s.tip; as tip) {
          <p class="row mt"><span>Propina voluntaria ({{ tip.methodName }}){{ tip.voided ? ' ANULADA' : '' }}</span><span>{{ cop(tip.amount) }}</span></p>
          <p class="row bold"><span>Total con propina</span><span>{{ cop(s.total + (tip.voided ? 0 : tip.amount)) }}</span></p>
        }
        <hr />
        @for (p of s.payments; track p.lineNo) {
          <p class="row"><span>{{ p.methodName }}</span><span>{{ cop(p.tendered) }}</span></p>
        }
        @if (s.changeAmount > 0) {
          <p class="row bold"><span>Cambio</span><span>{{ cop(s.changeAmount) }}</span></p>
        }
      }
      <ng-template #lines let-part>
        @for (item of part.items; track item.lineNo) {
          <p>{{ item.name }}</p>
          <!-- Adiciones y nota (Fase 12b-1): su precio ya va en el precio unitario de la línea. -->
          @for (m of item.modifiers ?? []; track $index) {
            <p class="sub">+ {{ m.optionName }}{{ m.quantity > 1 ? ' x' + m.quantity : '' }}</p>
          }
          @if (item.note) {
            <p class="sub">* {{ item.note }}</p>
          }
          <p class="row">
            <span>{{ q(item.quantity) }} {{ item.unitCode }} × {{ cop(item.unitPrice) }}</span>
            <span>{{ cop(item.grossAmount) }}</span>
          </p>
          @if (item.discountAmount > 0) {
            <p class="row"><span>  Desc. {{ q(item.discountPercent) }} %</span><span>-{{ cop(item.discountAmount) }}</span></p>
          }
        }
      </ng-template>
      <hr />
      @if (s.receipt.footer) {
        <p class="center">{{ s.receipt.footer }}</p>
      }
      <p class="center small">Comprobante interno de venta</p>
    </div>
  `,
  styles: `
    .receipt { font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 600; line-height: 1.3;
      color: #000; background: #fff; padding: 1mm 0; box-sizing: border-box; }
    .receipt-58 { font-size: 11px; }
    p { margin: 0; overflow-wrap: anywhere; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .row span:last-child { white-space: nowrap; }
    .sub { padding-left: 0.75em; }
    .center { text-align: center; }
    /* Logo del negocio (fase 8c): en gris, porque la impresora térmica imprime solo negro. */
    .logo { display: block; margin: 0 auto 4px; max-width: 70%; max-height: 18mm; object-fit: contain;
      filter: grayscale(1) contrast(1.6); }
    .bold { font-weight: 800; }
    .big { font-size: 1.15em; }
    .small { font-size: 0.85em; }
    .mt { margin-top: 4px; }
    hr { border: none; border-top: 1.5px dashed #000; margin: 4px 0; }
  `,
})
export class ReceiptComponent {
  readonly sale = input.required<Sale>();
  readonly width = input<ReceiptWidth>(80);
  protected readonly printable = computed(() => printableMm(this.width()));
  /** Logo del negocio (data URL) o null (fase 8c). */
  readonly logo = input<string | null>(null);

  protected readonly cop = formatCop;
  /** Cobro partido entre cajas (decisión 294): las partes y el total de todo; null si es una sola venta. */
  protected readonly split = computed(() => splitSummary(this.sale()));
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

  /** "PASSPORT" → "PA" (fase 8a). */
  protected readonly shortDocType = computed(() => documentShortLabel(this.sale().customerDocumentType));

  protected readonly document = computed(() => {
    const s = this.sale();
    return s.customerVerificationDigit === null
      ? s.customerDocumentNumber
      : `${s.customerDocumentNumber}-${s.customerVerificationDigit}`;
  });
}
