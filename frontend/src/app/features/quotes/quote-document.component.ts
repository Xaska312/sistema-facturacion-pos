import { Component, input } from '@angular/core';
import { Quote, QuoteConfig } from '../../core/api/api.models';
import { formatDay } from '../orders/order-text';
import { formatDate } from '../../shared/format';
import { formatCop, formatPercent, formatQuantity } from '../../shared/money';
import { partyName, partyPhone } from './quote-text';

/**
 * Cotización en hoja carta para imprimir o guardar como PDF (decisión 260): logo y datos del negocio, cliente,
 * líneas con descuento, total, vigencia, notas y condiciones. Con la clase {@code receipt-print-root} es el área de
 * impresión (styles.css oculta lo demás). Siempre en blanco y negro sobre blanco, como el tiquete.
 */
@Component({
  selector: 'app-quote-document',
  template: `
    @let q = quote();
    <article class="doc">
      <header class="head">
        <div class="issuer">
          @if (logo(); as src) {
            <img [src]="src" alt="" class="logo" />
          }
          <div>
            <p class="business">{{ config()?.businessName }}</p>
            @if (config()?.branchAddress) {
              <p>{{ config()!.branchAddress }}</p>
            }
            @if (config()?.branchPhone) {
              <p>Tel. {{ config()!.branchPhone }}</p>
            }
          </div>
        </div>
        <div class="title">
          <p class="kind">COTIZACIÓN</p>
          <p class="number">{{ q.number }}</p>
          <p>Fecha: {{ date(q.createdAt) }}</p>
          <p class="strong">Válida hasta: {{ day(q.validUntil) }}</p>
        </div>
      </header>

      <section class="party">
        <p class="label">Para</p>
        <p class="strong">{{ name(q) }}</p>
        @if (q.customerDocument) {
          <p>{{ q.customerDocument }}</p>
        }
        @if (phone(q)) {
          <p>Tel. {{ phone(q) }}</p>
        }
      </section>

      <table>
        <thead>
          <tr>
            <th class="left">Descripción</th>
            <th>Cantidad</th>
            <th>Precio unit.</th>
            <th>Desc.</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          @for (item of q.items; track item.id) {
            <tr>
              <td class="left">
                {{ item.productName }}
                @if (item.description) {
                  <span class="sub">{{ item.description }}</span>
                }
                @if (item.width !== null && item.length !== null) {
                  <span class="sub">{{ qty(item.width) }} × {{ qty(item.length) }} m</span>
                }
              </td>
              <td>{{ qty(item.quantity) }} {{ item.unitCode }}</td>
              <td>{{ cop(item.unitPrice) }}</td>
              <td>{{ item.discountPercent > 0 ? percent(item.discountPercent) : '—' }}</td>
              <td class="strong">{{ cop(item.total) }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="total-label">TOTAL</td>
            <td class="total">{{ cop(q.total) }}</td>
          </tr>
        </tfoot>
      </table>
      <p class="note">{{ config()?.pricesIncludeTax === false ? 'Precios unitarios antes de impuestos; el total los incluye.' : 'Precios con impuestos incluidos.' }}</p>

      @if (q.notes) {
        <section class="block">
          <p class="label">Notas</p>
          <p class="pre">{{ q.notes }}</p>
        </section>
      }
      @if (q.terms) {
        <section class="block">
          <p class="label">Condiciones</p>
          <p class="pre">{{ q.terms }}</p>
        </section>
      }
      @if (q.createdByName) {
        <p class="signed">Atendido por {{ q.createdByName }}</p>
      }
      <p class="foot">Cotización · no es factura</p>
    </article>
  `,
  styles: `
    .doc { width: 100%; max-width: 196mm; box-sizing: border-box; padding: 12mm 10mm; margin: 0 auto;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11pt; line-height: 1.35;
      color: #000; background: #fff; }
    p { margin: 0; overflow-wrap: anywhere; }
    .head { display: flex; justify-content: space-between; gap: 8mm; align-items: flex-start;
      border-bottom: 2px solid #000; padding-bottom: 4mm; }
    .issuer { display: flex; gap: 4mm; align-items: center; }
    .logo { max-width: 40mm; max-height: 22mm; object-fit: contain; }
    .business { font-size: 14pt; font-weight: 700; }
    .title { text-align: right; white-space: nowrap; }
    .kind { font-size: 9pt; letter-spacing: 0.15em; font-weight: 700; }
    .number { font-size: 18pt; font-weight: 800; font-family: ui-monospace, 'Courier New', monospace; }
    .party { margin: 5mm 0; }
    .label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: #333; }
    .strong { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 2mm 1.5mm; text-align: right; vertical-align: top; border-bottom: 1px solid #999; }
    th { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1.5px solid #000; }
    td { white-space: nowrap; }
    .left { text-align: left; white-space: normal; }
    .sub { display: block; font-size: 9pt; color: #333; }
    tfoot td { border-bottom: none; padding-top: 3mm; }
    .total-label { font-weight: 700; }
    .total { font-size: 14pt; font-weight: 800; }
    .note { font-size: 8.5pt; color: #333; text-align: right; }
    .block { margin-top: 5mm; }
    .pre { white-space: pre-line; }
    .signed { margin-top: 8mm; }
    .foot { margin-top: 6mm; font-size: 8.5pt; color: #333; text-align: center; }
  `,
})
export class QuoteDocumentComponent {
  readonly quote = input.required<Quote>();
  readonly config = input<QuoteConfig | null>(null);
  readonly logo = input<string | null>(null);

  protected readonly cop = formatCop;
  protected readonly qty = formatQuantity;
  protected readonly percent = formatPercent;
  protected readonly day = formatDay;
  protected readonly date = formatDate;
  protected readonly name = partyName;
  protected readonly phone = partyPhone;
}
