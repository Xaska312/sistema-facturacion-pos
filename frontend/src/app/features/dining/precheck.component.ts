import { Component, computed, input } from '@angular/core';
import { Precheck } from '../../core/api/dining.api';
import { formatCop, formatQuantity } from '../../shared/money';
import { ReceiptWidth, printableMm } from '../../shared/receipt/receipt-prefs';
import { PRECHECK_NOTICE, PrecheckBusiness, headerLines, precheckDate, precheckTitle } from './precheck';

/**
 * Precuenta para la impresora térmica por la ventana del navegador (decisión 380), con la misma letra y ancho del
 * tiquete (decisión 289). Con la clase {@code receipt-print-root} en su contenedor se imprime con printReceipt().
 */
@Component({
  selector: 'app-precheck',
  template: `
    @let p = precheck();
    <div class="receipt" [class.receipt-58]="width() === 58" [style.width.mm]="printable()">
      <p class="center bold big">{{ business().name }}</p>
      @for (line of header(); track $index) {
        <p class="center">{{ line }}</p>
      }
      <p class="center bold big mt">PRECUENTA</p>
      <p>{{ title() }}</p>
      <p>{{ date() }}</p>
      @if (p.openedByName) { <p>Atendió: {{ p.openedByName }}</p> }
      <hr />
      @for (l of p.lines; track $index) {
        <p>{{ l.name }}</p>
        @if (l.details) { <p class="detail">* {{ l.details }}</p> }
        <p class="row"><span>{{ q(l.quantity) }} x {{ cop(l.unitPrice) }}</span><span>{{ cop(l.total) }}</span></p>
      }
      <hr />
      @if (p.chargedTotal > 0) {
        <p class="row"><span>Ya pagado</span><span>{{ cop(p.chargedTotal) }}</span></p>
      }
      <p class="row"><span>Subtotal (base)</span><span>{{ cop(p.subtotal) }}</span></p>
      @if (p.tax > 0) {
        <p class="row"><span>Impuestos</span><span>{{ cop(p.tax) }}</span></p>
      }
      <p class="row bold big"><span>TOTAL</span><span>{{ cop(p.total) }}</span></p>
      @if (p.suggestedTip > 0) {
        <p class="row mt"><span>Propina voluntaria sugerida ({{ p.tipPercent }} %)</span><span>{{ cop(p.suggestedTip) }}</span></p>
        <p class="row bold"><span>Total con propina</span><span>{{ cop(p.total + p.suggestedTip) }}</span></p>
      }
      <hr />
      <p class="center">{{ notice }}</p>
    </div>
  `,
  styles: `
    .receipt { font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 600; line-height: 1.3;
      color: #000; background: #fff; padding: 1mm 0; box-sizing: border-box; }
    .receipt-58 { font-size: 11px; }
    p { margin: 0; overflow-wrap: anywhere; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .row span:last-child { white-space: nowrap; }
    .center { text-align: center; }
    .bold { font-weight: 800; }
    .big { font-size: 1.15em; }
    .mt { margin-top: 4px; }
    .detail { padding-left: 8px; }
    hr { border: none; border-top: 1.5px dashed #000; margin: 4px 0; }
  `,
})
export class PrecheckComponent {
  readonly precheck = input.required<Precheck>();
  readonly business = input.required<PrecheckBusiness>();
  readonly width = input<ReceiptWidth>(80);

  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly notice = PRECHECK_NOTICE;
  protected readonly printable = computed(() => printableMm(this.width()));
  protected readonly header = computed(() => headerLines(this.business().header));
  protected readonly title = computed(() => precheckTitle(this.precheck()));
  protected readonly date = computed(() => precheckDate(this.precheck().printedAt));
}
