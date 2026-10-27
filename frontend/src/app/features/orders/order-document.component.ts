import { Component, input } from '@angular/core';
import { Order } from '../../core/api/api.models';
import { BusinessHeader } from '../../core/api/branding.api';
import { formatDate } from '../../shared/format';
import { formatCop, formatQuantity } from '../../shared/money';
import { formatDay } from './order-text';

/**
 * Pedido en hoja carta para guardar como PDF y enviar al cliente (decisión 261): logo y datos del negocio, cliente,
 * líneas, total, abonado y lo que falta, entrega e indicaciones. No es factura. Con {@code receipt-print-root} y
 * {@code order-doc-root} se imprime con {@code printReceipt('.order-doc-root')}; siempre negro sobre blanco.
 */
@Component({
  selector: 'app-order-document',
  template: `
    @let o = order();
    <article class="doc">
      <header class="head">
        <div class="issuer">
          @if (logo(); as src) {
            <img [src]="src" alt="" class="logo" />
          }
          <div>
            <p class="business">{{ header()?.businessName || businessName() }}</p>
            @if (header()?.branchAddress) {
              <p>{{ header()!.branchAddress }}</p>
            }
            @if (header()?.branchPhone) {
              <p>Tel. {{ header()!.branchPhone }}</p>
            }
          </div>
        </div>
        <div class="title">
          <p class="kind">PEDIDO</p>
          <p class="number">{{ o.number }}</p>
          <p>Fecha: {{ date(o.createdAt) }}</p>
          @if (o.status === 'OPEN') {
            <p class="strong">Entrega: {{ day(o.dueDate) }}</p>
          }
        </div>
      </header>

      <section class="party">
        <p class="label">Cliente</p>
        <p class="strong">{{ o.customerName }}</p>
        <p>{{ o.customerDocument }}{{ o.customerPhone ? ' · Tel. ' + o.customerPhone : '' }}</p>
        @if (o.address) {
          <p>Dirección: {{ o.address }}</p>
        }
      </section>

      @if (o.status === 'CANCELLED') {
        <p class="banner">PEDIDO CANCELADO</p>
      }

      <table>
        <thead>
          <tr>
            <th class="left">Descripción</th>
            <th>Cantidad</th>
            <th>Precio unit.</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          @for (item of o.items; track item.id) {
            <tr>
              <td class="left">
                {{ item.productName }}
                @if (item.description) {
                  <span class="sub">{{ item.description }}</span>
                }
                @if (item.width !== null && item.length !== null) {
                  <span class="sub">{{ qty(item.width) }} × {{ qty(item.length) }} m</span>
                }
                @if (item.delivered) {
                  <span class="sub">Entregado</span>
                }
              </td>
              <td>{{ qty(item.quantity) }} {{ item.unitCode }}</td>
              <td>{{ cop(item.unitPrice) }}</td>
              <td class="strong">{{ cop(item.total) }}</td>
            </tr>
          }
        </tbody>
      </table>

      <section class="totals">
        <p class="row big"><span>TOTAL</span><span>{{ cop(o.total) }}</span></p>
        <p class="row"><span>Abonado</span><span>{{ cop(o.deposited) }}</span></p>
        @if (o.status === 'OPEN') {
          <p class="row strong"><span>Falta por pagar</span><span>{{ cop(o.balanceDue) }}</span></p>
        }
      </section>

      @if (o.notes) {
        <section class="block">
          <p class="label">Indicaciones</p>
          <p class="pre">{{ o.notes }}</p>
        </section>
      }
      <p class="foot">Comprobante de pedido · no es factura</p>
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
    .banner { border: 2px solid #000; text-align: center; font-weight: 800; padding: 2mm; margin-bottom: 4mm; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 2mm 1.5mm; text-align: right; vertical-align: top; border-bottom: 1px solid #999; }
    th { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1.5px solid #000; }
    td { white-space: nowrap; }
    .left { text-align: left; white-space: normal; }
    .sub { display: block; font-size: 9pt; color: #333; }
    .totals { margin: 4mm 0 0 auto; width: 75mm; }
    .row { display: flex; justify-content: space-between; gap: 4mm; padding: 1mm 0; }
    .big { font-size: 14pt; font-weight: 800; border-bottom: 1px solid #999; }
    .block { margin-top: 5mm; }
    .pre { white-space: pre-line; }
    .foot { margin-top: 8mm; font-size: 8.5pt; color: #333; text-align: center; }
  `,
})
export class OrderDocumentComponent {
  readonly order = input.required<Order>();
  readonly header = input<BusinessHeader | null>(null);
  /** Nombre del negocio de la sesión, por si no llegó el encabezado. */
  readonly businessName = input('');
  readonly logo = input<string | null>(null);

  protected readonly cop = formatCop;
  protected readonly qty = formatQuantity;
  protected readonly day = formatDay;
  protected readonly date = formatDate;
}
