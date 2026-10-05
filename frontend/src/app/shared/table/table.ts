import { PageQuery } from '../../core/api/organization.api';
import { formatDate, formatDateTime, formatRelative } from '../format';
import { formatCop, formatQuantity } from '../money';

/**
 * Tipos de celda de {@code app-data-table}:
 * text (por defecto), mono (códigos), money (pesos, a la derecha), number (cantidades, a la derecha),
 * date, datetime, relative ("hace 5 minutos", con la fecha completa al pasar el mouse) y status (insignia).
 */
export type CellKind = 'text' | 'mono' | 'money' | 'number' | 'date' | 'datetime' | 'relative' | 'status';

export type CellValue = string | number | null | undefined;

export interface ColumnDef<T> {
  header: string;
  /** Valor de la celda. Para kind 'status', una clave de {@code StatusKey}. */
  cell: (row: T) => CellValue;
  kind?: CellKind;
  /** Campo de ordenamiento del servidor; solo los que el backend permite (si falta, la columna no se ordena). */
  sortField?: string;
  /** Nombre de una plantilla {@code <ng-template appCell="nombre" let-row>} para pintar la celda a mano. */
  template?: string;
  /** Para kind 'status': texto en lugar del predeterminado del estado. */
  statusLabel?: (row: T) => string;
  /** Clases extra para la celda. */
  cellClass?: string;
  /** No mostrar en la vista de tarjetas (móvil). */
  hideOnMobile?: boolean;
}

/** Estado de la tabla que se pide al servidor. */
export interface TableQuery {
  page: number;
  size: number;
  /** "campo,asc" | "campo,desc" | null (orden predeterminado del servidor). */
  sort: string | null;
  search: string | null;
}

export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;

export function initialQuery(size = DEFAULT_PAGE_SIZE, sort: string | null = null): TableQuery {
  return { page: 0, size, sort, search: null };
}

/** Para las API que reciben {@link PageQuery}. */
export function toPageQuery(query: TableQuery): PageQuery {
  return query.sort ? { page: query.page, size: query.size, sort: query.sort } : { page: query.page, size: query.size };
}

export function sortDirection(sort: string | null, field: string): 'asc' | 'desc' | null {
  if (!sort) {
    return null;
  }
  const [sortField, direction] = sort.split(',');
  if (sortField !== field) {
    return null;
  }
  return direction === 'desc' ? 'desc' : 'asc';
}

/** Ciclo al hacer clic en el encabezado: ascendente → descendente → orden predeterminado. */
export function nextSort(sort: string | null, field: string): string | null {
  const direction = sortDirection(sort, field);
  if (direction === null) {
    return `${field},asc`;
  }
  return direction === 'asc' ? `${field},desc` : null;
}

export function isNumericKind(kind: CellKind | undefined): boolean {
  return kind === 'money' || kind === 'number';
}

/** Texto de una celda según su tipo; vacío → "—". */
export function formatCell(value: CellValue, kind: CellKind | undefined, now: Date = new Date()): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  switch (kind) {
    case 'money':
      return formatCop(Number(value));
    case 'number':
      return typeof value === 'number' ? formatQuantity(value) : value;
    case 'date':
      return formatDate(value);
    case 'datetime':
      return formatDateTime(value);
    case 'relative':
      return formatRelative(value, now);
    default:
      return String(value);
  }
}
