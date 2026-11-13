import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { PharmacyApi, VisitReport } from '../../core/api/pharmacy.api';
import { formatDateTime } from '../../shared/format';
import { formatCop, formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { printReceipt } from '../../shared/receipt/receipt-prefs';
import { formatDay } from '../orders/order-text';
import { professionLabel } from '../pos/dispensation';
import { businessToday, isoDate } from '../reports/periods';
import { degrees, percent, rangeLabel, readingText, sheet, shiftLabel } from './quality-text';

/**
 * Informe para la visita de la Secretaría de Salud (Fase 13-6, decisión 287): en hoja carta, lo que la inspección pide
 * revisar de un periodo. Se imprime o se guarda en PDF desde el navegador ("Guardar como PDF").
 */
@Component({
  selector: 'app-visit-report',
  imports: [FormsModule, RouterLink, ButtonModule, SkeletonComponent, PageHeaderComponent],
  template: `
    <app-page-header title="Informe para la visita"
                     description="Lo que la Secretaría de Salud revisa, de las fechas que elijas. Imprímelo o guárdalo en PDF.">
      <a pButton routerLink="/app/farmacia/calidad" label="Temperatura y calidad" icon="pi pi-arrow-left" [text]="true"
         severity="secondary"></a>
      <p-button label="Imprimir o guardar PDF" icon="pi pi-print" [disabled]="!report()" (onClick)="print()" />
    </app-page-header>

    <div class="flex flex-wrap items-center gap-3 mb-4">
      <label class="flex items-center gap-2 text-sm">Desde
        <input type="date" class="border rounded-[10px] px-2 min-h-11" [max]="to" [(ngModel)]="from" (ngModelChange)="load()" />
      </label>
      <label class="flex items-center gap-2 text-sm">Hasta
        <input type="date" class="border rounded-[10px] px-2 min-h-11" [min]="from" [max]="today" [(ngModel)]="to"
               (ngModelChange)="load()" />
      </label>
    </div>

    @if (report(); as r) {
      <article class="receipt-print-root card max-w-4xl p-8 text-sm leading-relaxed visit">
        <header class="flex flex-wrap justify-between gap-3 border-b pb-3 mb-4">
          <div>
            <p class="text-lg font-bold">{{ r.establishment.businessName }}</p>
            <p>{{ r.establishment.branchName }}{{ r.establishment.branchAddress ? ' · ' + r.establishment.branchAddress : '' }}</p>
            @if (r.establishment.branchPhone) { <p>Tel. {{ r.establishment.branchPhone }}</p> }
          </div>
          <div class="text-right">
            <p class="font-bold">INFORME PARA LA VISITA DE INSPECCIÓN</p>
            <p>Del {{ day(r.from) }} al {{ day(r.to) }}</p>
            <p class="text-xs">Generado {{ when(r.generatedAt) }}</p>
          </div>
        </header>

        <section>
          <h2>1. Director técnico</h2>
          @if (r.establishment.technicalDirector.name; as name) {
            <p>{{ name }} · {{ profession(r.establishment.technicalDirector.profession) }} · Tarjeta profesional
              {{ r.establishment.technicalDirector.license }}</p>
          } @else {
            <p class="warn">Sin registrar. Se anota en Ajustes → Director técnico.</p>
          }
        </section>

        <section>
          <h2>2. Temperatura y humedad</h2>
          <p>Lecturas esperadas: <strong>{{ r.quality.expected }}</strong> · registradas:
            <strong>{{ r.quality.expected - r.quality.missing }}</strong> · faltantes: <strong>{{ r.quality.missing }}</strong>
            · fuera de rango: <strong>{{ r.quality.outOfRange }}</strong></p>
          @for (p of r.quality.points; track p.id) {
            <p class="text-xs">{{ p.name }}: rango {{ range(p) }}{{ p.active ? '' : ' (inactivo)' }}</p>
          }
          @if (rows().length > 0) {
            <table>
              <thead>
                <tr>
                  <th rowspan="2">Día</th>
                  @for (p of r.quality.points; track p.id) { <th colspan="2" class="text-center">{{ p.name }}</th> }
                </tr>
                <tr>
                  @for (p of r.quality.points; track p.id) { <th>Mañana</th><th>Tarde</th> }
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.date) {
                  <tr>
                    <td>{{ day(row.date) }}</td>
                    @for (p of r.quality.points; track p.id) {
                      @for (c of row.cells[p.id]; track $index) {
                        <td [class.out]="c?.outOfRange">{{ c ? text(c) : '—' }}</td>
                      }
                    }
                  </tr>
                }
              </tbody>
            </table>
          }
          @if (outList().length > 0) {
            <h3>Fuera de rango y acciones</h3>
            <ul>
              @for (x of outList(); track x.id) {
                <li>{{ day(x.date) }} · {{ shift(x.shift) }} · {{ x.pointName }}: {{ text(x) }} — {{ x.actionTaken }}
                  ({{ x.recordedByName }})</li>
              }
            </ul>
          }
        </section>

        <section>
          <h2>3. Vencimientos</h2>
          <p>Vencidos con existencia: <strong>{{ r.expired.length }}</strong> · por vencer en {{ r.alertMonths }}
            {{ r.alertMonths === 1 ? 'mes' : 'meses' }}: <strong>{{ r.expiring.length }}</strong></p>
          @if (r.expired.length + r.expiring.length > 0) {
            <table>
              <thead><tr><th>Producto</th><th>Lote</th><th>Vence</th><th class="num">Cantidad</th><th>Estado</th></tr></thead>
              <tbody>
                @for (l of r.expired.concat(r.expiring); track l.lotId) {
                  <tr>
                    <td>{{ l.name }}</td><td>{{ l.lotNumber }}</td><td>{{ day(l.expirationDate) }}</td>
                    <td class="num">{{ q(l.quantity) }} {{ l.unitCode }}</td>
                    <td [class.out]="l.status === 'EXPIRED'">{{ l.status === 'EXPIRED' ? 'Vencido: separar y dar de baja' : 'Por vencer' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        <section>
          <h2>4. Actas de baja</h2>
          @if (r.disposals.length === 0) {
            <p>Sin bajas en el periodo.</p>
          } @else {
            <table>
              <thead><tr><th>N.º</th><th>Fecha</th><th>Motivo</th><th>Disposición final</th><th>Testigo</th><th class="num">Valor</th></tr></thead>
              <tbody>
                @for (d of r.disposals; track d.number) {
                  <tr><td>{{ d.number }}</td><td>{{ when(d.createdAt) }}</td><td>{{ d.reason }}</td><td>{{ d.method }}</td>
                    <td>{{ d.witness ?? '—' }}</td><td class="num">{{ cop(d.value) }}</td></tr>
                }
              </tbody>
            </table>
          }
        </section>

        <section>
          <h2>5. Recepción técnica de compras</h2>
          @if (r.receipts.length === 0) {
            <p>Sin recepciones en el periodo.</p>
          } @else {
            <table>
              <thead><tr><th>N.º</th><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Revisión</th><th>Nevera</th>
                <th class="num">Rechazado</th></tr></thead>
              <tbody>
                @for (x of r.receipts; track x.number) {
                  <tr><td>{{ x.number }}</td><td>{{ when(x.receivedAt) }}</td><td>{{ x.supplier }}</td><td>{{ x.invoice }}</td>
                    <td>{{ x.checksConfirmed ? 'Completa' : 'Incompleta' }}</td>
                    <td>{{ x.coldChainTemperature === null ? '—' : deg(x.coldChainTemperature) }}</td>
                    <td class="num">{{ x.rejectedTotal > 0 ? cop(x.rejectedTotal) : '—' }}</td></tr>
                }
              </tbody>
            </table>
          }
        </section>

        <section>
          <h2>6. Dispensación</h2>
          <p>Ventas con fórmula: <strong>{{ r.dispensations.total }}</strong> · con antibióticos:
            <strong>{{ r.dispensations.antibiotics }}</strong> · control especial: <strong>{{ r.dispensations.controlled }}</strong>
            · anuladas: <strong>{{ r.dispensations.voided }}</strong></p>
          @if (r.antibiotics.length > 0) {
            <h3>Antibióticos dispensados</h3>
            <table>
              <thead><tr><th>Fecha</th><th>Venta</th><th>Paciente</th><th>Prescriptor</th><th>Medicamento</th></tr></thead>
              <tbody>
                @for (a of r.antibiotics; track a.saleNumber) {
                  <tr><td>{{ when(a.at) }}</td><td>{{ a.saleNumber }}</td>
                    <td>{{ a.patientName }}{{ a.patientDocument ? ' · ' + a.patientDocument : '' }}</td>
                    <td>{{ a.prescriberName }}{{ a.prescriberLicense ? ' · ' + a.prescriberLicense : '' }}</td>
                    <td>{{ a.medicines }}</td></tr>
                }
              </tbody>
            </table>
          }
        </section>

        <section>
          <h2>7. Eventos adversos</h2>
          @if (r.adverseEvents.length === 0) {
            <p>Sin eventos adversos en el periodo.</p>
          } @else {
            <table>
              <thead><tr><th>N.º</th><th>Fecha</th><th>Medicamento</th><th>Paciente</th><th>Qué pasó</th><th>Reporte INVIMA</th></tr></thead>
              <tbody>
                @for (e of r.adverseEvents; track e.id) {
                  <tr><td>{{ e.number }}</td><td>{{ day(e.occurredOn) }}</td>
                    <td>{{ e.productName }}{{ e.lotNumber ? ' · lote ' + e.lotNumber : '' }}{{ e.serious ? ' (grave)' : '' }}</td>
                    <td>{{ e.patientName }}</td><td>{{ e.description }}</td>
                    <td [class.out]="!e.reportedOn">{{ e.reportedOn ? day(e.reportedOn) + (e.invimaReference ? ' · ' + e.invimaReference : '') : 'Pendiente' }}</td></tr>
                }
              </tbody>
            </table>
          }
        </section>

        <div class="grid grid-cols-2 gap-8 mt-16">
          <div class="border-t pt-1"><p>Director técnico</p></div>
          <div class="border-t pt-1"><p>Funcionario de la Secretaría de Salud</p></div>
        </div>
      </article>
    } @else {
      <app-skeleton height="20rem" borderRadius="1.25rem" />
    }
  `,
  styles: [`
    section { margin-bottom: 1.25rem; break-inside: avoid-page; }
    h2 { font-weight: 800; font-size: 1rem; margin-bottom: 0.375rem; }
    h3 { font-weight: 700; margin: 0.5rem 0 0.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.75rem; margin-top: 0.375rem; }
    th, td { border: 1px solid var(--surface-border); padding: 0.2rem 0.35rem; text-align: left; vertical-align: top; }
    th { font-weight: 700; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .text-center { text-align: center; }
    .out { color: var(--danger); font-weight: 700; }
    .warn { color: var(--danger); font-weight: 600; }
    ul { list-style: disc; padding-left: 1.25rem; }
    @media print {
      .visit { padding: 1.2cm; max-width: none; box-shadow: none; border: 0; font-size: 11px; }
      th, td { border-color: currentColor; }
      .out, .warn { color: inherit; text-decoration: underline; }
    }
  `],
})
export class VisitReportComponent implements OnInit {
  private readonly api = inject(PharmacyApi);
  protected readonly report = signal<VisitReport | null>(null);
  protected readonly today = isoDate(businessToday());
  protected from = this.today.slice(0, 8) + '01';
  protected to = this.today;

  protected readonly rows = computed(() => {
    const r = this.report();
    return r ? sheet(r.quality.readings, r.quality.points.map((p) => p.id), r.from, r.to) : [];
  });
  protected readonly outList = computed(() => (this.report()?.quality.readings ?? []).filter((x) => x.outOfRange));

  protected readonly day = formatDay;
  protected readonly when = formatDateTime;
  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly range = rangeLabel;
  protected readonly text = readingText;
  protected readonly shift = shiftLabel;
  protected readonly deg = degrees;
  protected readonly pct = percent;
  protected readonly profession = professionLabel;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (!this.from || !this.to || this.from > this.to) {
      return;
    }
    this.report.set(null);
    this.api.visitReport(null, this.from, this.to).subscribe((r) => this.report.set(r));
  }

  protected print(): void {
    printReceipt();
  }
}
