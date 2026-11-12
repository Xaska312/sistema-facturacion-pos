import { Component, computed, input } from '@angular/core';
import { IncomeStatement, Statement } from '../../core/api/finance.api';
import { formatDay } from '../orders/order-text';
import { formatCop } from '../../shared/money';
import { changeText, change, marginText, plainWords, statementRows } from './income-statement-text';

/**
 * Estado de resultados en hoja carta para imprimir o guardar como PDF (decisión 323): logo y nombre del negocio, el
 * periodo con sus comparaciones, la explicación en palabras y lo que va aparte. Con {@code receipt-print-root} es el
 * área de impresión; siempre negro sobre blanco, como la cotización.
 */
@Component({
  selector: 'app-income-statement-document',
  template: `
    @let r = report();
    <article class="doc">
      <header class="head">
        <div class="issuer">
          @if (logo(); as src) {
            <img [src]="src" alt="" class="logo" />
          }
          <p class="business">{{ businessName() }}</p>
        </div>
        <div class="title">
          <p class="kind">ESTADO DE RESULTADOS</p>
          <p class="strong">{{ day(r.current.from) }} a {{ day(r.current.to) }}</p>
          <p>{{ r.branchName ? 'Sede ' + r.branchName : 'Todas las sedes' }}</p>
        </div>
      </header>

      <table>
        <thead>
          <tr>
            <th class="left">Concepto</th>
            <th>Este periodo</th>
            @if (r.previous; as p) { <th>Anterior<span class="sub">{{ day(p.from) }} a {{ day(p.to) }}</span></th><th>Var.</th> }
            @if (r.lastYear; as y) { <th>Año pasado<span class="sub">{{ day(y.from) }} a {{ day(y.to) }}</span></th><th>Var.</th> }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.key) {
            <tr [class.result]="row.kind === 'result'" [class.expense]="row.kind === 'expense'">
              <td class="left">{{ row.kind === 'minus' ? '− ' : row.kind === 'result' ? '= ' : '' }}{{ row.label }}</td>
              <td>{{ cop(row.value(r.current)) }}</td>
              @if (r.previous; as p) { <td>{{ cop(row.value(p)) }}</td><td>{{ diff(row.value(r.current), row.value(p)) }}</td> }
              @if (r.lastYear; as y) { <td>{{ cop(row.value(y)) }}</td><td>{{ diff(row.value(r.current), row.value(y)) }}</td> }
            </tr>
          }
        </tbody>
      </table>
      @if (r.current.grossMargin !== null) {
        <p class="note">Margen bruto {{ margin(r.current.grossMargin) }} · margen operativo {{ margin(r.current.operatingMargin) }}</p>
      }

      <section class="block">
        <p class="label">En palabras</p>
        @for (line of words(); track $index) { <p>{{ line }}</p> }
      </section>

      <section class="block">
        <p class="label">Aparte (no es ingreso ni gasto del negocio)</p>
        <p>IVA y otros impuestos cobrados: {{ cop(r.current.tax) }} (son de la DIAN).</p>
        @if (r.current.withheld !== null) {
          <p>Retenciones que te hicieron: {{ cop(r.current.withheld) }} (las descuentas al declarar).</p>
        }
        @if (r.unpaidRecurring.count > 0) {
          <p>Gastos fijos del periodo sin pagar: {{ cop(r.unpaidRecurring.total) }} (no están restados).</p>
        }
      </section>
      <p class="foot">Hecho con XASKA POS con lo registrado en el sistema · no reemplaza los estados financieros de tu contador</p>
    </article>
  `,
  styles: `
    .doc { width: 100%; max-width: 196mm; box-sizing: border-box; padding: 12mm 10mm; margin: 0 auto;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 10.5pt; line-height: 1.35;
      color: #000; background: #fff; }
    p { margin: 0; }
    .head { display: flex; justify-content: space-between; gap: 8mm; align-items: center;
      border-bottom: 2px solid #000; padding-bottom: 4mm; margin-bottom: 5mm; }
    .issuer { display: flex; gap: 4mm; align-items: center; }
    .logo { max-width: 40mm; max-height: 22mm; object-fit: contain; }
    .business { font-size: 14pt; font-weight: 700; }
    .title { text-align: right; }
    .kind { font-size: 9pt; letter-spacing: 0.15em; font-weight: 700; }
    .strong { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 1.6mm 1.5mm; text-align: right; border-bottom: 1px solid #bbb; white-space: nowrap; }
    th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1.5px solid #000;
      vertical-align: bottom; }
    .sub { display: block; font-size: 7.5pt; text-transform: none; letter-spacing: 0; font-weight: 400; }
    .left { text-align: left; white-space: normal; }
    tr.result td { font-weight: 800; border-bottom: 1.5px solid #000; }
    tr.expense td.left { padding-left: 6mm; color: #333; }
    .note { margin-top: 2mm; font-size: 8.5pt; color: #333; text-align: right; }
    .block { margin-top: 5mm; display: flex; flex-direction: column; gap: 1mm; }
    .label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: #333; }
    .foot { margin-top: 8mm; font-size: 8pt; color: #333; text-align: center; }
  `,
})
export class IncomeStatementDocumentComponent {
  readonly report = input.required<IncomeStatement>();
  readonly businessName = input('');
  readonly logo = input<string | null>(null);

  protected readonly rows = computed(() => {
    const r = this.report();
    return statementRows(r.current, [r.previous, r.lastYear]);
  });
  protected readonly words = computed(() => plainWords(this.report().current));
  protected readonly cop = formatCop;
  protected readonly day = formatDay;
  protected readonly margin = marginText;

  protected diff(current: number | null, other: number | null): string {
    return changeText(change(current, other));
  }

  /** Para pruebas o reuso: el periodo actual. */
  protected current(): Statement {
    return this.report().current;
  }
}
