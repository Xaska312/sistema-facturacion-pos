import { DiningEvent } from '../../core/realtime/dining-events.service';
import { comandaHtml } from './comanda-print';
import { isReadyFor } from './restaurant-live.service';
import { minutesSince, ticketStatusLabel, urgency } from './ticket-labels';

const event = (over: Partial<DiningEvent>): DiningEvent => ({
  type: 'TICKET_STATUS', branchId: 'b', tabId: 't', ticketId: 'k', number: 12, stationId: 's', label: 'Mesa 4',
  status: 'READY', userId: 'ana', ...over,
});

describe('pantalla de cocina (Fase 12b-4)', () => {
  it('nombra los estados y pinta la demora: 10 min amarilla, 20 min roja', () => {
    expect(ticketStatusLabel('PREPARING')).toBe('Preparando');
    const now = new Date('2026-10-30T20:30:00Z');
    expect(minutesSince('2026-10-30T20:21:30Z', now)).toBe(8);
    expect(urgency('2026-10-30T20:21:00Z', now)).toBe('ok');
    expect(urgency('2026-10-30T20:20:00Z', now)).toBe('late');
    expect(urgency('2026-10-30T20:10:00Z', now)).toBe('overdue');
  });

  it('el aviso de "Lista" es solo para quien envió la comanda', () => {
    expect(isReadyFor(event({}), 'ana')).toBeTrue();
    expect(isReadyFor(event({}), 'luis')).toBeFalse();
    expect(isReadyFor(event({ status: 'PREPARING' }), 'ana')).toBeFalse();
    expect(isReadyFor(event({ type: 'TICKET_SENT', status: 'NEW' }), 'ana')).toBeFalse();
    expect(isReadyFor(event({}), null)).toBeFalse();
  });

  it('el aviso de anulación se imprime con su encabezado y "NO PREPARAR"', () => {
    const html = comandaHtml({
      id: 'v', number: 15, branchId: 'b', tabId: 't', tabLabel: 'Mesa 4', kind: 'TABLE', guests: null, notes: null,
      stationId: 's', stationName: 'Cocina', sentAt: '2026-10-30T17:00:00Z', sentById: 'u', sentByName: 'Caja',
      status: 'DELIVERED', printCount: 1, type: 'VOID', voidOfNumber: 12, preparingAt: null, readyAt: null,
      items: [{ id: 'i', name: 'Hamburguesa', quantity: 1, note: null, voided: true, modifiers: [] }],
    });
    expect(html).toContain('ANULACIÓN');
    expect(html).toContain('de la comanda #12');
    expect(html).toContain('NO PREPARAR: 1 HAMBURGUESA');
  });
});
