import { formatDateTime, formatTime } from '../../shared/format';

/** Icono y nombre corto de cada medio de pago (los nombres del backend son largos para un botón). */
const METHOD_LOOK: Record<string, { icon: string; label: string }> = {
  CASH: { icon: 'pi pi-money-bill', label: 'Efectivo' },
  CARD: { icon: 'pi pi-credit-card', label: 'Tarjeta' },
  TRANSFER: { icon: 'pi pi-mobile', label: 'Transferencia' },
};

export function methodIcon(code: string): string {
  return METHOD_LOOK[code]?.icon ?? 'pi pi-wallet';
}

export function methodLabel(code: string, name: string): string {
  return METHOD_LOOK[code]?.label ?? name;
}

/** "desde 8:05 a. m." si la caja se abrió hoy; si no, con la fecha ("desde 4 oct 2026, 8:05 p. m."). */
export function openedSince(openedAt: string, now: Date = new Date()): string {
  const opened = new Date(openedAt);
  if (Number.isNaN(opened.getTime())) {
    return '';
  }
  return opened.toDateString() === now.toDateString()
    ? `desde ${formatTime(opened)}`
    : `desde ${formatDateTime(opened)}`;
}

/** Existencia para la tarjeta del producto: "Agotado", "12 disp." o nada si no se controla. */
export function stockLabel(quantity: number | undefined): string | null {
  if (quantity === undefined) {
    return null;
  }
  if (quantity <= 0) {
    return 'Agotado';
  }
  return `${quantity.toLocaleString('es-CO', { maximumFractionDigits: 3 })} disp.`;
}

export interface Shortcut {
  keys: string;
  action: string;
}

export const POS_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'F2', action: 'Buscar producto por nombre' },
  { keys: 'F4', action: 'Cobrar' },
  { keys: 'Enter', action: 'Agregar el código escrito · Registrar la venta en el cobro · Nueva venta' },
  { keys: 'Esc', action: 'Cerrar la ventana abierta o cancelar la venta' },
  { keys: '3*código', action: 'Agregar 3 unidades de un código' },
  { keys: '?', action: 'Ver estos atajos (con el campo de código vacío)' },
];
