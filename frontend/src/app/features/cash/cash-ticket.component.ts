import { Component, computed, input } from '@angular/core';
import { CashReport } from '../../core/api/api.models';
import { formatCop } from '../../shared/money';
import { ReceiptWidth } from '../../shared/receipt/receipt-prefs';
import { cashRows, reportTitle, ticketDateTime } from './cash-ticket-text';
import { differenceLabel } from './labels';

/**
 * Informe de caja como tiquete térmico (58 u 80 mm), para imprimir al cerrar o desde el historial. Con la clase
 * {@code receipt-print-root} es el área de impresión. Respeta el cierre ciego (sin esperado ni diferencia).
 */
@Component({
  selector: 'app-cash-ticket',
  template: `
    @let r = report();
    <div class="receipt" [class.receipt-58]="width() === 58" [style.width.mm]="width()">
      @if (logo(); as src) {
        <img [src]="src" alt="" class="logo" />
      }
      <p class="center bold">{{ businessName() }}</p>
      <p class="center bold mt">{{ title() }}</p>
      <p>Caja {{ r.session.registerCode }}{{ r.session.branchName ? ' · ' + r.session.branchName : '' }}</p>
      <p>Abrió: {{ r.session.openedByName }}</p>
      <p>{{ date(r.session.openedAt) }}</p>
      @if (r.session.closedAt) {
        <p>Cerró: {{ r.session.closedByName }}</p>
        <p>{{ date(r.session.closedAt) }}</p>
      }
      <hr />
      <p class="bold">VENTAS</p>
      <p class="row"><span>Ventas ({{ r.salesCount }})</span><span>{{ cop(r.salesTotal) }}</span></p>
      @if (r.voidedCount > 0) {
        <p class="row"><span>Anuladas ({{ r.voidedCount }})</span><span>-{{ cop(r.voidedTotal) }}</span></p>
      }
      <p class="row bold"><span>Ventas netas</span><span>{{ cop(r.netSales) }}</span></p>
      @for (m of r.byMethod; track m.paymentMethodId) {
        <p class="row indent"><span>{{ m.name ?? 'Otro' }} ({{ m.count }})</span><span>{{ cop(m.amount) }}</span></p>
      }
      @if (r.voidedAfterCloseCount > 0) {
        <p class="small">Anuladas después del cierre ({{ r.voidedAfterCloseCount }}): {{ cop(r.voidedAfterCloseTotal) }}</p>
      }
      <hr />
      <p class="bold">EFECTIVO</p>
      @for (row of rows(); track row[0]) {
        <p class="row"><span>{{ row[0] }}</span><span>{{ cop(row[1]) }}</span></p>
      }
      @if (r.auditView && r.cash.expected !== null) {
        <p class="row bold"><span>Esperado</span><span>{{ cop(r.cash.expected) }}</span></p>
      }
      @if (r.cash.counted !== null) {
        <p class="row bold"><span>Contado</span><span>{{ cop(r.cash.counted) }}</span></p>
      }
      @if (r.auditView && r.cash.difference !== null) {
        <p class="row bold big"><span>{{ difference(r.cash.difference) }}</span><span>{{ cop(r.cash.difference) }}</span></p>
      }
      @if (r.session.closingNotes) {
        <hr />
        <p>Notas: {{ r.session.closingNotes }}</p>
      }
      <hr />
      @if (!r.auditView) {
        <p class="center small">El esperado y la diferencia los revisa el administrador.</p>
      }
      <p class="center small">Impreso {{ date(printedAt()) }}</p>
      <br />
      <p>Firma: ______________________</p>
    </div>
  `,
  styles: `
    .receipt { font-family: ui-monospace, 'Courier New', monospace; font-size: 12px; line-height: 1.3; color: #000;
      background: #fff; padding: 3mm; box-sizing: border-box; }
    .receipt-58 { font-size: 10px; }
    p { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .row span:last-child { white-space: nowrap; }
    .center { text-align: center; }
    .logo { display: block; margin: 0 auto 4px; max-width: 70%; max-height: 18mm; object-fit: contain; filter: grayscale(1); }
    .bold { font-weight: 700; }
    .big { font-size: 1.15em; }
    .small { font-size: 0.85em; }
    .mt { margin-top: 4px; }
    .indent { padding-left: 2ch; }
    hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  `,
})
export class CashTicketComponent {
  readonly report = input.required<CashReport>();
  readonly businessName = input('');
  readonly width = input<ReceiptWidth>(80);
  readonly logo = input<string | null>(null);

  protected readonly title = computed(() => reportTitle(this.report()).toUpperCase());
  protected readonly rows = computed(() => cashRows(this.report()));
  /** Hora de impresión: se renueva con cada informe (el componente no se recrea al cambiar de sesión). */
  protected readonly printedAt = computed(() => {
    this.report();
    return new Date().toISOString();
  });
  protected readonly cop = formatCop;
  protected readonly difference = differenceLabel;

  protected date(value: string | null): string {
    return ticketDateTime(value);
  }
}
