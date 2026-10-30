import { TabItem, TabKind } from '../../core/api/dining.api';
import { XIconName } from '../../shared/icons/xicons';

/** Textos y cálculos de mesas y cuentas (Fase 12b-2). */

/** Tiempo que lleva abierta: "5 min", "1 h 05". */
export function openFor(openedAt: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(openedAt)) / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** Minutos abierta (para el color de la baldosa). */
export function minutesOpen(openedAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(openedAt)) / 60_000));
}

export function kindGlyph(kind: TabKind): XIconName {
  return kind === 'TABLE' ? 'tables' : kind === 'TAKEAWAY' ? 'takeaway' : 'delivery';
}

export function kindLabel(kind: TabKind): string {
  return kind === 'TABLE' ? 'Mesa' : kind === 'TAKEAWAY' ? 'Para llevar' : 'Domicilio';
}

/** "Grande · Shot extra ×2". */
export function itemExtras(item: Pick<TabItem, 'modifiers'>): string {
  return item.modifiers.map((m) => (m.quantity > 1 ? `${m.name} ×${m.quantity}` : m.name)).join(' · ');
}

/** Productos vigentes (sin los quitados). */
export function activeItems(items: readonly TabItem[]): TabItem[] {
  return items.filter((i) => !i.voided);
}

/** Total de una línea con el precio con que se agregó. */
export function itemTotal(item: Pick<TabItem, 'quantity' | 'unitPrice'>): number {
  return Math.round(item.quantity * item.unitPrice);
}
