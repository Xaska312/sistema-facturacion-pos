import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, contentChild, input, output } from '@angular/core';
import { PageResponse } from '../core/api/api.models';

export interface ColumnDef<T> {
  header: string;
  cell: (row: T) => string;
  /** Clases extra para la celda (p. ej. 'font-mono'). */
  cellClass?: string;
}

export interface RowContext<T> {
  $implicit: T;
}

/**
 * Tabla genérica con paginación del servidor. Las acciones por fila se pasan con
 * {@code <ng-template #actions let-row>…</ng-template>}.
 */
@Component({
  selector: 'app-data-table',
  imports: [NgTemplateOutlet],
  template: `
    <div class="bg-white rounded-xl shadow overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left">
          <tr>
            @for (column of columns(); track column.header) {
              <th class="p-3 font-medium">{{ column.header }}</th>
            }
            @if (actions()) {
              <th class="p-3 text-right font-medium">Acciones</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track trackBy()(row)) {
            <tr class="border-t">
              @for (column of columns(); track column.header) {
                <td class="p-3" [class]="column.cellClass ?? ''">{{ column.cell(row) }}</td>
              }
              @if (actions(); as tpl) {
                <td class="p-3 text-right whitespace-nowrap">
                  <ng-container *ngTemplateOutlet="tpl; context: { $implicit: row }" />
                </td>
              }
            </tr>
          } @empty {
            <tr>
              <td [attr.colspan]="columns().length + (actions() ? 1 : 0)" class="p-6 text-center text-slate-500">
                {{ loading() ? 'Cargando…' : emptyText() }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    @if (page(); as p) {
      @if (p.totalPages > 1) {
        <nav class="flex items-center justify-end gap-3 mt-3 text-sm">
          <span class="text-slate-500">Página {{ p.page + 1 }} de {{ p.totalPages }} · {{ p.totalElements }} registros</span>
          <button type="button" class="px-3 py-1 rounded border disabled:opacity-40"
                  [disabled]="p.page === 0" (click)="pageChange.emit(p.page - 1)">Anterior</button>
          <button type="button" class="px-3 py-1 rounded border disabled:opacity-40"
                  [disabled]="p.page + 1 >= p.totalPages" (click)="pageChange.emit(p.page + 1)">Siguiente</button>
        </nav>
      }
    }
  `,
})
export class DataTableComponent<T> {
  readonly columns = input.required<ColumnDef<T>[]>();
  readonly page = input<PageResponse<T> | null>(null);
  readonly loading = input(false);
  readonly emptyText = input('Sin registros');
  readonly trackBy = input<(row: T) => unknown>((row: T) => row);
  readonly pageChange = output<number>();

  readonly actions = contentChild<TemplateRef<RowContext<T>>>('actions');
  protected readonly rows = computed(() => this.page()?.content ?? []);
}
