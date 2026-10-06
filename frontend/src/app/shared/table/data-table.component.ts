import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, contentChild, contentChildren, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SkeletonModule } from 'primeng/skeleton';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { PageResponse } from '../../core/api/api.models';
import { EmptyStateComponent } from '../empty-state.component';
import { formatDateTime } from '../format';
import { StatusKey, isStatusKey } from '../status';
import { StatusBadgeComponent } from '../status-badge.component';
import { ViewportService } from '../viewport';
import { CellTemplateDirective } from './cell-template.directive';
import {
  ColumnDef,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  TableQuery,
  formatCell,
  initialQuery,
  isNumericKind,
  nextSort,
  sortDirection,
} from './table';

export interface RowContext<T> {
  $implicit: T;
}

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Tabla de la app. Dos modos:
 * - Paginada en el servidor: {@code [page]} (PageResponse). Emite {@code queryChange} al cambiar de página, tamaño,
 *   orden (columnas con {@code sortField}) o búsqueda (con debounce); la pantalla pide los datos con esa consulta.
 * - Lista en memoria: {@code [items]} (sin paginación).
 *
 * Incluye caja de búsqueda opcional ({@code searchPlaceholder}), filtros extra proyectados con el atributo
 * {@code tableToolbar}, esqueleto de carga, estado vacío con acción, celdas por tipo (dinero, fechas, estados) o con
 * plantilla ({@code <ng-template appCell="nombre" let-row>}), acciones por fila ({@code <ng-template #actions let-row>})
 * y vista de tarjetas en pantallas pequeñas.
 */
@Component({
  selector: 'app-data-table',
  imports: [NgTemplateOutlet, InputTextModule, PaginatorModule, SkeletonModule, EmptyStateComponent, StatusBadgeComponent],
  template: `
    <div class="flex flex-wrap items-center gap-2 mb-3 empty:hidden">
      @if (searchPlaceholder(); as placeholder) {
        <span class="relative w-full md:w-80">
          <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
             aria-hidden="true"></i>
          <input #searchBox pInputText type="search" class="w-full" [style.padding-left.rem]="2.25"
                 [placeholder]="placeholder" [attr.aria-label]="placeholder" [value]="searchText()"
                 (input)="onSearch(searchBox.value)" (keydown.enter)="searchNow(searchBox.value)" />
        </span>
      }
      <ng-content select="[tableToolbar]" />
    </div>

    <div class="card overflow-hidden" [attr.aria-busy]="loading()">
      @if (viewport.isDesktop()) {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            @if (caption()) {
              <caption class="sr-only">{{ caption() }}</caption>
            }
            <thead class="bg-surface-alt text-left">
              <tr>
                @for (column of columns(); track column.header) {
                  <th scope="col" class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap"
                      [class.text-right]="numeric(column)" [attr.aria-sort]="ariaSort(column)">
                    @if (sortable(column)) {
                      <button type="button" class="sort-button" [class.flex-row-reverse]="numeric(column)"
                              (click)="toggleSort(column)">
                        <span>{{ column.header }}</span>
                        <i [class]="sortIcon(column)" aria-hidden="true"></i>
                      </button>
                    } @else {
                      {{ column.header }}
                    }
                  </th>
                }
                @if (actions()) {
                  <th scope="col" class="px-4 py-3"><span class="sr-only">Acciones</span></th>
                }
              </tr>
            </thead>
            <tbody [class.opacity-60]="loading() && !showSkeleton()">
              @if (showSkeleton()) {
                @for (i of skeletonRows; track i) {
                  <tr class="border-t border-line">
                    @for (column of columns(); track column.header) {
                      <td class="px-4 py-3"><p-skeleton height="0.875rem" [width]="i % 2 === 0 ? '80%' : '60%'" /></td>
                    }
                    @if (actions()) {
                      <td class="px-4 py-3"><p-skeleton height="0.875rem" width="4rem" /></td>
                    }
                  </tr>
                }
              } @else {
                @for (row of visibleRows(); track trackBy()(row)) {
                  <tr class="border-t border-line hover:bg-surface-alt transition-colors">
                    @for (column of columns(); track column.header) {
                      <td class="px-4 py-3 align-middle" [class]="cellClasses(column)">
                        <ng-container *ngTemplateOutlet="cell; context: { $implicit: row, column: column }" />
                      </td>
                    }
                    @if (actions(); as tpl) {
                      <td class="px-4 py-2 text-right whitespace-nowrap">
                        <div class="inline-flex items-center justify-end gap-1">
                          <ng-container *ngTemplateOutlet="tpl; context: { $implicit: row }" />
                        </div>
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td [attr.colspan]="colspan()"><ng-container *ngTemplateOutlet="empty" /></td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      } @else {
        <ul [class.opacity-60]="loading() && !showSkeleton()">
          @if (showSkeleton()) {
            @for (i of skeletonRows.slice(0, 3); track i) {
              <li class="p-4 flex flex-col gap-2 border-t border-line first:border-t-0">
                <p-skeleton height="1rem" width="60%" />
                <p-skeleton height="0.75rem" width="90%" />
                <p-skeleton height="0.75rem" width="70%" />
              </li>
            }
          } @else {
            @for (row of visibleRows(); track trackBy()(row)) {
              <li class="p-4 flex flex-col gap-1.5 border-t border-line first:border-t-0">
                @for (column of mobileColumns(); track column.header; let first = $first) {
                  @if (first) {
                    <div class="font-medium">
                      <ng-container *ngTemplateOutlet="cell; context: { $implicit: row, column: column }" />
                    </div>
                  } @else {
                    <div class="flex items-start justify-between gap-3 text-sm">
                      <span class="text-muted shrink-0">{{ column.header }}</span>
                      <span class="text-right min-w-0 break-words" [class]="column.kind === 'mono' ? 'font-mono' : ''">
                        <ng-container *ngTemplateOutlet="cell; context: { $implicit: row, column: column }" />
                      </span>
                    </div>
                  }
                }
                @if (actions(); as tpl) {
                  <div class="flex flex-wrap items-center justify-end gap-1 pt-1">
                    <ng-container *ngTemplateOutlet="tpl; context: { $implicit: row }" />
                  </div>
                }
              </li>
            } @empty {
              <li><ng-container *ngTemplateOutlet="empty" /></li>
            }
          }
        </ul>
      }
    </div>

    @if (page(); as p) {
      @if (p.totalElements > 0) {
        <div class="flex flex-wrap items-center justify-between gap-2 mt-3 text-sm">
          <span class="text-muted" aria-live="polite">{{ rangeText() }}</span>
          @if (p.totalPages > 1 || pageSizeOptions().length > 0) {
            <p-paginator [first]="p.page * p.size" [rows]="p.size" [totalRecords]="p.totalElements"
                         [rowsPerPageOptions]="pageSizeOptionsList()" [pageLinkSize]="viewport.isDesktop() ? 5 : 3"
                         (onPageChange)="onPage($event)" [style]="{ background: 'transparent', padding: '0' }" />
          }
        </div>
      }
    }

    <ng-template #cell let-row let-column="column">
      @if (customTemplate(column); as custom) {
        <ng-container *ngTemplateOutlet="custom; context: { $implicit: row }" />
      } @else if (column.kind === 'status') {
        @if (statusOf(column, row); as status) {
          <app-status-badge [status]="status" [label]="statusLabelOf(column, row)" />
        } @else {
          <span class="text-muted">—</span>
        }
      } @else if (column.kind === 'relative') {
        <time [attr.datetime]="rawText(column, row)" [title]="fullDate(column, row)">{{ text(column, row) }}</time>
      } @else {
        {{ text(column, row) }}
      }
    </ng-template>

    <ng-template #empty>
      @if (searchText()) {
        <app-empty-state icon="pi pi-search" title="Sin resultados"
                         [message]="'No encontramos coincidencias para «' + searchText() + '».'"
                         actionLabel="Limpiar búsqueda" actionIcon="pi pi-times" (action)="clearSearch()" />
      } @else {
        <app-empty-state [icon]="emptyIcon()" [title]="emptyTitle()" [message]="emptyMessage()"
                         [actionLabel]="emptyActionLabel()" [actionIcon]="emptyActionIcon()" (action)="emptyAction.emit()" />
      }
    </ng-template>
  `,
  styles: `
    .sort-button {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font: inherit;
      text-transform: inherit;
      letter-spacing: inherit;
      color: inherit;
      border-radius: 0.25rem;
    }
    .sort-button:hover { color: var(--text); }
    .sort-button .pi { font-size: 0.7rem; }
  `,
})
export class DataTableComponent<T> {
  protected readonly viewport = inject(ViewportService);

  readonly columns = input.required<ColumnDef<T>[]>();
  /** Modo paginado en el servidor. */
  readonly page = input<PageResponse<T> | null>(null);
  /** Modo lista en memoria (sin paginación). */
  readonly items = input<readonly T[] | null>(null);
  readonly loading = input(false);
  readonly trackBy = input<(row: T) => unknown>((row: T) => row);
  /** Descripción de la tabla para lectores de pantalla. */
  readonly caption = input<string | null>(null);
  /** Con texto, muestra la caja de búsqueda (debounce de 350 ms). */
  readonly searchPlaceholder = input<string | null>(null);
  readonly pageSize = input(DEFAULT_PAGE_SIZE);
  /** Orden inicial ("campo,asc"); debe coincidir con el que usa la pantalla en su primera carga. */
  readonly initialSort = input<string | null>(null);
  /** Opciones del selector de tamaño de página; vacío lo oculta. */
  readonly pageSizeOptions = input<readonly number[]>(PAGE_SIZE_OPTIONS);
  readonly emptyTitle = input('No hay registros');
  readonly emptyMessage = input<string | null>(null);
  readonly emptyIcon = input('pi pi-inbox');
  /** Acción del estado vacío (p. ej. "Crear producto"); sin texto no hay botón. */
  readonly emptyActionLabel = input<string | null>(null);
  readonly emptyActionIcon = input('pi pi-plus');

  readonly queryChange = output<TableQuery>();
  readonly emptyAction = output<void>();

  readonly actions = contentChild<TemplateRef<RowContext<T>>>('actions');
  private readonly cellTemplates = contentChildren(CellTemplateDirective);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly searchText = signal('');
  private readonly state = signal<TableQuery | null>(null);
  private readonly search$ = new Subject<string>();

  protected readonly visibleRows = computed<readonly T[]>(() => this.page()?.content ?? this.items() ?? []);
  protected readonly showSkeleton = computed(() => this.loading() && this.visibleRows().length === 0);
  protected readonly colspan = computed(() => this.columns().length + (this.actions() ? 1 : 0));
  protected readonly mobileColumns = computed(() => this.columns().filter((c) => !c.hideOnMobile));
  protected readonly pageSizeOptionsList = computed(() => [...this.pageSizeOptions()]);
  protected readonly rangeText = computed(() => {
    const p = this.page();
    if (!p || p.totalElements === 0) {
      return '';
    }
    const from = p.page * p.size + 1;
    const to = Math.min((p.page + 1) * p.size, p.totalElements);
    return `${from}–${to} de ${p.totalElements.toLocaleString('es-CO')}`;
  });

  constructor() {
    this.search$
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((text) => this.emit({ page: 0, search: text.trim() || null }));
  }

  /** Consulta actual (página, tamaño, orden y búsqueda). */
  query(): TableQuery {
    return this.state() ?? initialQuery(this.pageSize(), this.initialSort());
  }

  protected onSearch(text: string): void {
    this.searchText.set(text);
    this.search$.next(text);
  }

  protected searchNow(text: string): void {
    this.searchText.set(text);
    const search = text.trim() || null;
    if (search !== this.query().search) {
      this.emit({ page: 0, search });
    }
  }

  protected clearSearch(): void {
    this.searchText.set('');
    this.search$.next('');
    this.emit({ page: 0, search: null });
  }

  protected onPage(event: PaginatorState): void {
    const current = this.query();
    const size = event.rows ?? current.size;
    this.emit({ size, page: size !== current.size ? 0 : (event.page ?? 0) });
  }

  protected toggleSort(column: ColumnDef<T>): void {
    if (column.sortField) {
      this.emit({ page: 0, sort: nextSort(this.query().sort, column.sortField) ?? this.initialSort() });
    }
  }

  protected sortable(column: ColumnDef<T>): boolean {
    return !!column.sortField && this.page() !== null;
  }

  protected ariaSort(column: ColumnDef<T>): 'ascending' | 'descending' | 'none' | null {
    if (!this.sortable(column) || !column.sortField) {
      return null;
    }
    const direction = sortDirection(this.query().sort, column.sortField);
    return direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';
  }

  protected sortIcon(column: ColumnDef<T>): string {
    const direction = column.sortField ? sortDirection(this.query().sort, column.sortField) : null;
    return direction === 'asc' ? 'pi pi-sort-amount-up-alt' : direction === 'desc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-alt';
  }

  protected numeric(column: ColumnDef<T>): boolean {
    return isNumericKind(column.kind);
  }

  protected cellClasses(column: ColumnDef<T>): string {
    const classes = [column.cellClass ?? ''];
    if (this.numeric(column)) {
      classes.push('text-right tabular-nums whitespace-nowrap');
    }
    if (column.kind === 'mono') {
      classes.push('font-mono');
    }
    if (column.kind === 'date' || column.kind === 'datetime' || column.kind === 'relative') {
      classes.push('whitespace-nowrap');
    }
    return classes.join(' ').trim();
  }

  protected customTemplate(column: ColumnDef<T>): TemplateRef<{ $implicit: unknown }> | null {
    if (!column.template) {
      return null;
    }
    return this.cellTemplates().find((t) => t.appCell() === column.template)?.template ?? null;
  }

  protected text(column: ColumnDef<T>, row: T): string {
    return formatCell(column.cell(row), column.kind);
  }

  protected rawText(column: ColumnDef<T>, row: T): string {
    const value = column.cell(row);
    return value === null || value === undefined ? '' : String(value);
  }

  protected fullDate(column: ColumnDef<T>, row: T): string {
    return formatDateTime(column.cell(row));
  }

  protected statusOf(column: ColumnDef<T>, row: T): StatusKey | null {
    const value = column.cell(row);
    return isStatusKey(value) ? value : null;
  }

  protected statusLabelOf(column: ColumnDef<T>, row: T): string | null {
    return column.statusLabel ? column.statusLabel(row) : null;
  }

  private emit(change: Partial<TableQuery>): void {
    const next = { ...this.query(), ...change };
    this.state.set(next);
    this.queryChange.emit(next);
  }
}
