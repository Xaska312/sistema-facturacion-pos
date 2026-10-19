import { CashMovementType, CashSessionStatus } from '../../core/api/api.models';

export const CASH_MOVEMENT_LABEL: Record<CashMovementType, string> = {
  SALE: 'Venta',
  SALE_VOID: 'Anulación',
  INCOME: 'Ingreso',
  EXPENSE: 'Egreso',
  WITHDRAWAL: 'Retiro',
  CREDIT_PAYMENT: 'Abono de fiado',
  CREDIT_PAYMENT_VOID: 'Abono anulado',
  ORDER_PAYMENT: 'Anticipo de pedido',
  ORDER_REFUND: 'Devolución de anticipo',
};

export const SESSION_STATUS_LABEL: Record<CashSessionStatus, string> = {
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
};

/** Texto del arqueo: faltante, sobrante o cuadrada. */
export function differenceLabel(difference: number | null): string {
  if (difference === null) {
    return '—';
  }
  if (difference < 0) {
    return 'Faltante';
  }
  return difference > 0 ? 'Sobrante' : 'Cuadrada';
}
