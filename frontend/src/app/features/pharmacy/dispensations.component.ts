import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageResponse } from '../../core/api/api.models';
import { Dispensation, PharmacyApi } from '../../core/api/pharmacy.api';
import { formatDateTime } from '../../shared/format';
import { LatestRequest } from '../../shared/latest-request';
import { formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { addDays } from '../quotes/quote-text';
import { formatDay, isoDay } from '../orders/order-text';

/**
 * Libro de dispensación (Fase 13-4, decisión 282): cada venta con medicamentos bajo fórmula, quién la dispensó, de qué
 * lote y, en antibióticos y control especial, quién firmó la fórmula, su fecha y el paciente. Para la visita de la
 * Secretaría de Salud y la vigilancia de antibióticos.
 */
@Component({
  selector: 'app-dispensations',
  imports: [FormsModule, PageHeaderComponent, DataTableComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Libro de dispensación"
                     description="Lo que se vendió con fórmula médica: quién lo dispensó, de qué lote y, en antibióticos, los datos de la fórmula." />

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackBy" caption="Dispensaciones"
                    searchPlaceholder="Paciente, documento, médico o número de venta" emptyIcon="pi pi-book"
                    emptyTitle="No hay dispensaciones en estas fechas"
                    emptyMessage="Cada venta de un medicamento bajo fórmula queda aquí sola."
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Desde</span>
        <input type="date" class="border rounded-[10px] px-2 min-h-11" [max]="to" [(ngModel)]="from" (ngModelChange)="reload()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Hasta</span>
        <input type="date" class="border rounded-[10px] px-2 min-h-11" [min]="from" [(ngModel)]="to" (ngModelChange)="reload()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm min-h-11">
        <input type="checkbox" [(ngModel)]="antibioticOnly" (ngModelChange)="reload()" /> Solo antibióticos
      </label>
      <ng-template appCell="sale" let-row>
        <span class="font-mono">{{ row.saleNumber }}</span>
        @if (row.voided) {
          <span class="block text-xs text-danger">Anulada</span>
        }
        <span class="block text-xs text-muted">{{ when(row.dispensedAt) }}</span>
      </ng-template>
      <ng-template appCell="items" let-row>
        @for (l of row.lines; track $index) {
          <span class="block">{{ q(l.quantity) }} {{ l.unitCode }} · {{ l.productName }}
            @if (l.antibiotic) { <span class="text-xs text-warning">antibiótico</span> }
            @if (l.lots) { <span class="text-xs text-muted">· lote {{ l.lots }}</span> }</span>
        }
      </ng-template>
      <ng-template appCell="prescription" let-row>
        @if (row.prescriberName) {
          <span class="block">{{ row.prescriberName }}{{ row.prescriberLicense ? ' · ' + row.prescriberLicense : '' }}</span>
          <span class="block text-xs text-muted">Fórmula del {{ day(row.prescriptionDate) }}</span>
        } @else {
          <span class="text-xs text-muted">Fórmula vista</span>
        }
      </ng-template>
      <ng-template appCell="patient" let-row>
        @if (row.patientName) {
          <span class="block">{{ row.patientName }}</span>
          <span class="block text-xs text-muted">{{ row.patientDocument }}</span>
        } @else {
          <span class="text-xs text-muted">—</span>
        }
      </ng-template>
    </app-data-table>
  `,
})
export class DispensationsComponent implements OnInit {
  private readonly latest = new LatestRequest();
  private readonly api = inject(PharmacyApi);
  protected readonly page = signal<PageResponse<Dispensation> | null>(null);
  protected readonly loading = signal(true);
  protected to = isoDay(new Date());
  protected from = addDays(this.to, -30);
  protected antibioticOnly = false;
  private query: TableQuery = initialQuery();

  protected readonly q = formatQuantity;
  protected readonly day = formatDay;
  protected readonly when = formatDateTime;
  protected readonly trackBy = (row: Dispensation): string => row.saleId;
  protected readonly columns: ColumnDef<Dispensation>[] = [
    { header: 'Venta', cell: (d) => d.saleNumber, template: 'sale' },
    { header: 'Qué se dispensó', cell: (d) => d.lines.map((l) => l.productName).join(', '), template: 'items' },
    { header: 'Fórmula', cell: (d) => d.prescriberName, template: 'prescription', hideOnMobile: true },
    { header: 'Paciente', cell: (d) => d.patientName, template: 'patient' },
    { header: 'Dispensó', cell: (d) => d.dispensedByName, hideOnMobile: true },
  ];

  ngOnInit(): void {
    this.load(this.query);
  }

  reload(): void {
    this.load({ ...this.query, page: 0 });
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.book(this.from || null, this.to || null, this.antibioticOnly, query.search, toPageQuery(query))
      .pipe(this.latest.only()).subscribe({
        next: (result) => {
          this.page.set(result);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
