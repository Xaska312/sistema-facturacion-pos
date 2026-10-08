import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { forkJoin } from 'rxjs';
import { PageResponse } from '../../core/api/api.models';
import {
  AuditActionOption,
  AuditActorOption,
  AuditApi,
  AuditDetail,
  AuditEntry,
  AuditFilters,
} from '../../core/api/audit.api';
import { saveDownload } from '../../shared/download';
import { formatDateTime } from '../../shared/format';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery } from '../../shared/table/table';
import { addDays, businessToday, isoDate } from '../reports/periods';
import { DataRow, actionLabel, actionOptions, dataRows, entityLabel, entityOptions } from './audit-labels';
import { LatestRequest } from '../../shared/latest-request';

/** Nombre del autor; sin autor es una acción del sistema. */
export function actorText(name: string | null, id: string | null): string {
  if (name) {
    return name;
  }
  return id ? 'Usuario retirado' : 'Sistema';
}

/**
 * Auditoría del negocio (permiso audit:read): quién hizo qué y cuándo, con los datos antes y después de cada
 * cambio. Solo lectura: los registros no se pueden modificar ni borrar.
 */
@Component({
  selector: 'app-audit',
  imports: [FormsModule, ButtonModule, DialogModule, DataTableComponent, PageHeaderComponent],
  template: `
    <app-page-header title="Auditoría"
                     description="Quién hizo qué y cuándo en el negocio: ventas, anulaciones, cajas, precios, inventario, usuarios y entradas al sistema. Los registros no se pueden modificar ni borrar.">
      <p-button label="Exportar a Excel (CSV)" icon="pi pi-download" severity="secondary" [outlined]="true"
                [loading]="exporting()" (onClick)="download()" />
    </app-page-header>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById" [pageSize]="50"
                    caption="Auditoría" searchPlaceholder="Buscar en los datos (nombre, número, código…)"
                    emptyIcon="pi pi-history" emptyTitle="No hay registros con estos filtros"
                    emptyMessage="Cambia las fechas, el usuario o el módulo."
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Desde</span>
        <input type="date" class="border rounded-md px-2 py-2" [max]="filters.to ?? ''"
               [(ngModel)]="filters.from" (ngModelChange)="reloadFirstPage()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Hasta</span>
        <input type="date" class="border rounded-md px-2 py-2" [min]="filters.from ?? ''"
               [(ngModel)]="filters.to" (ngModelChange)="reloadFirstPage()" />
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Usuario</span>
        <select class="border rounded-md px-2 py-2 max-w-48" [(ngModel)]="filters.actorId" (ngModelChange)="reloadFirstPage()">
          <option [ngValue]="null">Todos</option>
          @for (actor of actors(); track actor.id) {
            <option [ngValue]="actor.id">{{ actorName(actor) }}</option>
          }
        </select>
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Módulo</span>
        <select class="border rounded-md px-2 py-2 max-w-48" [ngModel]="filters.entity" (ngModelChange)="changeEntity($event)">
          <option [ngValue]="null">Todos</option>
          @for (option of entities(); track option.value) {
            <option [ngValue]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Acción</span>
        <select class="border rounded-md px-2 py-2 max-w-56" [(ngModel)]="filters.action" (ngModelChange)="reloadFirstPage()">
          <option [ngValue]="null">Todas</option>
          @for (option of actionChoices(); track option.value) {
            <option [ngValue]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>
      <ng-template #actions let-row>
        <p-button label="Ver" icon="pi pi-eye" size="small" [text]="true" (onClick)="open(row)"
                  [ariaLabel]="'Ver detalle: ' + describe(row)" />
      </ng-template>
    </app-data-table>

    <p-dialog [header]="detail() ? describe(detail()!) : 'Detalle'" [(visible)]="detailOpen" [modal]="true"
              [style]="{ width: '40rem' }" [breakpoints]="{ '640px': '95vw' }">
      @if (detail(); as d) {
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mb-4">
          <dt class="text-muted">Fecha</dt>
          <dd>{{ when(d.createdAt) }}</dd>
          <dt class="text-muted">Usuario</dt>
          <dd>{{ actorText(d.actorName, d.actorId) }}</dd>
          <dt class="text-muted">Módulo</dt>
          <dd>{{ entityLabel(d.entity) }}</dd>
          @if (d.label) {
            <dt class="text-muted">Registro</dt>
            <dd>{{ d.label }}</dd>
          }
          @if (d.entityId) {
            <dt class="text-muted">Id del registro</dt>
            <dd class="font-mono text-xs break-all">{{ d.entityId }}</dd>
          }
          @if (d.ip) {
            <dt class="text-muted">IP</dt>
            <dd class="font-mono text-xs">{{ d.ip }}</dd>
          }
        </dl>

        @if (rows().length > 0) {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <caption class="sr-only">Datos guardados</caption>
              <thead>
                <tr class="text-left text-muted border-b border-line">
                  <th scope="col" class="py-2 pr-3 font-medium">Dato</th>
                  @if (d.before) {
                    <th scope="col" class="py-2 pr-3 font-medium">Antes</th>
                  }
                  <th scope="col" class="py-2 font-medium">{{ d.before ? 'Después' : 'Valor' }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.field) {
                  <tr class="border-b border-line align-top" [class.bg-warning-soft]="row.changed">
                    <th scope="row" class="py-2 pr-3 font-medium text-left">
                      {{ row.label }}
                      @if (row.changed) {
                        <span class="sr-only">(cambió)</span>
                      }
                    </th>
                    @if (d.before) {
                      <td class="py-2 pr-3 break-words">{{ row.before }}</td>
                    }
                    <td class="py-2 break-words">{{ row.after }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (changedCount() > 0) {
            <p class="text-xs text-muted mt-2">Resaltado: {{ changedCount() === 1 ? 'el dato que cambió' : 'los datos que cambiaron' }}.</p>
          }
        } @else {
          <p class="text-sm text-muted">Esta acción no guarda datos adicionales.</p>
        }
      }
      <ng-template #footer>
        <p-button label="Cerrar" (onClick)="detailOpen = false" />
      </ng-template>
    </p-dialog>
  `,
})
export class AuditComponent implements OnInit {
  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latest = new LatestRequest();
  private readonly audit = inject(AuditApi);

  protected readonly page = signal<PageResponse<AuditEntry> | null>(null);
  protected readonly loading = signal(true);
  protected readonly exporting = signal(false);
  protected readonly detail = signal<AuditDetail | null>(null);
  protected readonly actors = signal<AuditActorOption[]>([]);
  private readonly actionList = signal<AuditActionOption[]>([]);
  private readonly selectedEntity = signal<string | null>(null);

  protected readonly entities = computed(() => entityOptions(this.actionList()));
  protected readonly actionChoices = computed(() => actionOptions(this.actionList(), this.selectedEntity()));
  protected readonly rows = computed<DataRow[]>(() => {
    const d = this.detail();
    return d ? dataRows(d.before, d.after) : [];
  });
  protected readonly changedCount = computed(() => this.rows().filter((r) => r.changed).length);

  protected filters: AuditFilters = AuditComponent.defaultFilters();
  protected query: TableQuery = initialQuery(50);
  protected detailOpen = false;

  protected readonly entityLabel = entityLabel;
  protected readonly actorText = actorText;
  protected readonly trackById = (row: AuditEntry): string => row.id;
  protected readonly columns: ColumnDef<AuditEntry>[] = [
    { header: 'Fecha', cell: (r) => r.createdAt, kind: 'datetime' },
    { header: 'Usuario', cell: (r) => actorText(r.actorName, r.actorId) },
    { header: 'Acción', cell: (r) => actionLabel(r.action, r.entity) },
    { header: 'Módulo', cell: (r) => entityLabel(r.entity), hideOnMobile: true },
    { header: 'Registro', cell: (r) => r.label },
    { header: 'IP', cell: (r) => r.ip, kind: 'mono', hideOnMobile: true },
  ];

  /** Últimos 7 días (hoy incluido), igual que el servidor cuando no recibe fechas. */
  static defaultFilters(today: Date = businessToday()): AuditFilters {
    const to = isoDate(today);
    return { from: addDays(to, -6), to, actorId: null, entity: null, action: null, q: null };
  }

  ngOnInit(): void {
    forkJoin({ actions: this.audit.actions(), actors: this.audit.actors() }).subscribe({
      next: ({ actions, actors }) => {
        this.actionList.set(actions);
        this.actors.set(actors);
      },
      // Sin opciones, los filtros quedan en "Todos" y la tabla funciona igual.
      error: () => undefined,
    });
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.filters = { ...this.filters, q: query.search };
    this.loading.set(true);
    this.audit.search(this.filters, query.page, query.size).pipe(this.latest.only()).subscribe({
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

  changeEntity(entity: string | null): void {
    this.filters.entity = entity;
    this.selectedEntity.set(entity);
    if (this.filters.action && !this.actionChoices().some((o) => o.value === this.filters.action)) {
      this.filters.action = null;
    }
    this.reloadFirstPage();
  }

  open(row: AuditEntry): void {
    this.audit.detail(row.id).subscribe((d) => {
      this.detail.set(d);
      this.detailOpen = true;
    });
  }

  download(): void {
    this.exporting.set(true);
    this.audit.csv(this.filters).subscribe({
      next: (response) => {
        this.exporting.set(false);
        saveDownload(response, 'auditoria.csv');
      },
      // El error ya se muestra en un aviso (interceptor).
      error: () => this.exporting.set(false),
    });
  }

  protected describe(entry: { action: string; entity: string; label: string | null }): string {
    const action = actionLabel(entry.action, entry.entity);
    return entry.label ? `${action}: ${entry.label}` : action;
  }

  protected actorName(actor: AuditActorOption): string {
    return actorText(actor.name, actor.id);
  }

  protected when(value: string): string {
    return formatDateTime(value);
  }
}
