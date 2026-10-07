import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageResponse } from '../../core/api/api.models';
import { PlatformApi, SecurityEvent, SecurityEventFilters } from '../../core/api/platform.api';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { ColumnDef, TableQuery, initialQuery } from '../../shared/table/table';
import { addDays, isoDate } from '../reports/periods';
import { EVENT_LABEL, eventDetail, eventLabel, isWarningEvent } from './platform-labels';

/** Eventos de seguridad de la plataforma: inicios de sesión, intentos fallidos, bloqueos, límites, negocios. */
@Component({
  selector: 'app-platform-events',
  imports: [FormsModule, PageHeaderComponent, DataTableComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Eventos de seguridad"
                     description="Inicios de sesión, intentos fallidos, bloqueos, límites superados y cambios de estado de los negocios. No se pueden modificar ni borrar." />

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById" [pageSize]="50"
                    caption="Eventos de seguridad" searchPlaceholder="Correo o IP"
                    emptyIcon="pi pi-shield" emptyTitle="No hay eventos con estos filtros"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Desde</span>
        <input type="date" class="border rounded-md px-2 py-2" [(ngModel)]="filters.from" (ngModelChange)="reloadFirstPage()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Hasta</span>
        <input type="date" class="border rounded-md px-2 py-2" [(ngModel)]="filters.to" (ngModelChange)="reloadFirstPage()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Evento</span>
        <select class="border rounded-md px-2 py-2 max-w-56" [(ngModel)]="filters.event" (ngModelChange)="reloadFirstPage()">
          <option [ngValue]="null">Todos</option>
          @for (option of eventOptions; track option.value) {
            <option [ngValue]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>
      <ng-template appCell="event" let-row>
        <span class="inline-flex items-center gap-1.5" [class.text-danger]="warning(row.event)">
          @if (warning(row.event)) {
            <i class="pi pi-exclamation-triangle text-xs" aria-hidden="true"></i>
          }
          {{ label(row.event) }}
        </span>
      </ng-template>
      <ng-template appCell="who" let-row>
        <div class="flex flex-col">
          <span>{{ row.email ?? '—' }}</span>
          @if (row.userName) {
            <span class="text-xs text-muted">{{ row.userName }}</span>
          }
        </div>
      </ng-template>
    </app-data-table>
  `,
})
export class PlatformEventsComponent implements OnInit {
  private readonly platform = inject(PlatformApi);

  protected readonly page = signal<PageResponse<SecurityEvent> | null>(null);
  protected readonly loading = signal(true);
  protected filters: SecurityEventFilters = PlatformEventsComponent.defaultFilters();
  protected query: TableQuery = initialQuery(50);

  protected readonly eventOptions = Object.entries(EVENT_LABEL)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  protected readonly trackById = (row: SecurityEvent): string => row.id;
  protected readonly columns: ColumnDef<SecurityEvent>[] = [
    { header: 'Fecha', cell: (e) => e.occurredAt, kind: 'datetime' },
    { header: 'Evento', cell: (e) => eventLabel(e.event), template: 'event' },
    { header: 'Usuario', cell: (e) => e.email, template: 'who' },
    { header: 'Detalle', cell: (e) => eventDetail(e) },
    { header: 'Negocio', cell: (e) => e.tenantName, hideOnMobile: true },
    { header: 'IP', cell: (e) => e.ip, kind: 'mono', hideOnMobile: true },
  ];

  /** Últimos 7 días, hoy incluido (igual que el servidor sin fechas). */
  static defaultFilters(today: Date = new Date()): SecurityEventFilters {
    const to = isoDate(today);
    return { from: addDays(to, -6), to, event: null, q: null };
  }

  ngOnInit(): void {
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.filters = { ...this.filters, q: query.search };
    this.loading.set(true);
    this.platform.securityEvents(this.filters, query.page, query.size).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  reloadFirstPage(): void {
    this.load({ ...this.query, page: 0 });
  }

  protected label(event: string): string {
    return eventLabel(event);
  }

  protected warning(event: string): boolean {
    return isWarningEvent(event);
  }
}
