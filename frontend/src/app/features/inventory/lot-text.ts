import { LotRow } from '../../core/api/inventory.api';
import { StatusKey } from '../../shared/status';

/** Insignia del vencimiento de un lote (Fase 13-3): vencido, vence en N días o vigente. */
export function expiryBadge(row: Pick<LotRow, 'status' | 'daysLeft'>): { key: StatusKey; label: string } {
  if (row.status === 'EXPIRED') {
    return { key: 'expired', label: 'Vencido' };
  }
  if (row.status === 'EXPIRING') {
    return { key: 'pending', label: daysText(row.daysLeft) };
  }
  return { key: 'active', label: 'Vigente' };
}

/** "Vence hoy", "Vence mañana", "Vence en 12 días", "Venció hace 3 días". */
export function daysText(days: number | null): string {
  if (days === null) {
    return 'Sin fecha';
  }
  if (days === 0) {
    return 'Vence hoy';
  }
  if (days > 0) {
    return days === 1 ? 'Vence mañana' : `Vence en ${days} días`;
  }
  return days === -1 ? 'Venció ayer' : `Venció hace ${-days} días`;
}

/** Texto plano del vencimiento (para la tabla en celular y el CSV). */
export function expiryText(row: Pick<LotRow, 'expirationDate' | 'daysLeft'>): string {
  return row.expirationDate ? `${row.expirationDate} · ${daysText(row.daysLeft)}` : 'Sin fecha';
}
