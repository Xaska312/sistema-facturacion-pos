import { InventoryDocumentType, MovementType, StockStatus } from '../../core/api/api.models';

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  INITIAL: 'Saldo inicial',
  PURCHASE: 'Compra',
  SALE: 'Venta',
  SALE_VOID: 'Anulación de venta',
  ADJUSTMENT_IN: 'Ajuste (entrada)',
  ADJUSTMENT_OUT: 'Ajuste (salida)',
  TRANSFER_OUT: 'Traslado (salida)',
  TRANSFER_IN: 'Traslado (entrada)',
  RETURN: 'Devolución',
};

export const DOCUMENT_LABEL: Record<InventoryDocumentType, string> = {
  INITIAL: 'Saldo inicial',
  ADJUSTMENT: 'Ajuste',
  TRANSFER: 'Traslado',
  COUNT: 'Conteo físico',
};

export const STATUS_LABEL: Record<StockStatus, string> = {
  LOW: 'Bajo mínimo',
  OK: 'Normal',
  OVER: 'Sobre máximo',
};

/** Ruta del editor para cada tipo de documento (en minúsculas para la URL). */
export const DOCUMENT_ROUTE: Record<InventoryDocumentType, string> = {
  INITIAL: 'saldo-inicial',
  ADJUSTMENT: 'ajuste',
  TRANSFER: 'traslado',
  COUNT: 'conteo',
};

export function documentTypeFromRoute(segment: string): InventoryDocumentType | null {
  const entry = (Object.entries(DOCUMENT_ROUTE) as [InventoryDocumentType, string][]).find(([, route]) => route === segment);
  return entry ? entry[0] : null;
}

/** Número de documento con prefijo: 12 → "INV-000012". */
export function documentNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : 'INV-' + String(n).padStart(6, '0');
}
