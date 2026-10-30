import { TicketStatus } from '../../core/api/kitchen.api';

/** Textos de los estados de la comanda (Fase 12b-4). */
export const TICKET_STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  NEW: 'Nueva',
  PREPARING: 'Preparando',
  READY: 'Lista',
  DELIVERED: 'Entregada',
};

export function ticketStatusLabel(status: TicketStatus): string {
  return TICKET_STATUS_LABELS[status] ?? status;
}

/** Minutos desde que salió (para el color de la tarjeta en la pantalla de cocina). */
export function minutesSince(at: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(at)) / 60_000));
}

/** A tiempo (menos de 10 min), demorada (10 a 19) o atrasada (20 o más). */
export function urgency(at: string, now: Date = new Date()): 'ok' | 'late' | 'overdue' {
  const minutes = minutesSince(at, now);
  return minutes >= 20 ? 'overdue' : minutes >= 10 ? 'late' : 'ok';
}
