/**
 * Mapa único de estados → texto y color. Toda la app pinta los estados con {@code app-status-badge}
 * para que "Anulada" o "Inactivo" se vean igual en todas las pantallas.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type StatusKey =
  | 'active'
  | 'active-f'
  | 'inactive'
  | 'inactive-f'
  | 'open'
  | 'closed'
  | 'completed'
  | 'voided'
  | 'pending'
  | 'expired'
  | 'owner'
  | 'system'
  | 'default'
  | 'stock-low'
  | 'stock-ok'
  | 'stock-over'
  | 'cash-balanced'
  | 'cash-short'
  | 'cash-over';

export const STATUS: Record<StatusKey, { label: string; tone: StatusTone }> = {
  active: { label: 'Activo', tone: 'success' },
  'active-f': { label: 'Activa', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
  'inactive-f': { label: 'Inactiva', tone: 'neutral' },
  open: { label: 'Abierta', tone: 'info' },
  closed: { label: 'Cerrada', tone: 'neutral' },
  completed: { label: 'Registrada', tone: 'success' },
  voided: { label: 'Anulada', tone: 'danger' },
  pending: { label: 'Pendiente', tone: 'warning' },
  expired: { label: 'Vencida', tone: 'danger' },
  owner: { label: 'Propietario', tone: 'info' },
  system: { label: 'Sistema', tone: 'info' },
  default: { label: 'Predeterminada', tone: 'info' },
  'stock-low': { label: 'Bajo mínimo', tone: 'danger' },
  'stock-ok': { label: 'Normal', tone: 'success' },
  'stock-over': { label: 'Sobre máximo', tone: 'warning' },
  'cash-balanced': { label: 'Cuadrada', tone: 'success' },
  'cash-short': { label: 'Faltante', tone: 'danger' },
  'cash-over': { label: 'Sobrante', tone: 'warning' },
};

export function isStatusKey(value: unknown): value is StatusKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STATUS, value);
}

/** Estado de activo/inactivo; {@code feminine} para sucursal, caja, lista… ("Activa"). */
export function activeStatus(active: boolean, feminine = false): StatusKey {
  if (feminine) {
    return active ? 'active-f' : 'inactive-f';
  }
  return active ? 'active' : 'inactive';
}

/** Arqueo de caja según la diferencia (contado − esperado). */
export function cashDifferenceStatus(difference: number): StatusKey {
  if (difference < 0) {
    return 'cash-short';
  }
  return difference > 0 ? 'cash-over' : 'cash-balanced';
}
