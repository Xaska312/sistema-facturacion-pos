import { TabItem } from '../../core/api/dining.api';
import { activeItems, itemExtras, itemTotal, kindGlyph, kindLabel, minutesOpen, openFor } from './dining-labels';

const item = (over: Partial<TabItem> = {}): TabItem => ({
  id: 'i', position: 1, productId: 'p', unitId: null, name: 'Hamburguesa', quantity: 2, unitPrice: 18000, basePrice: 18000,
  openPrice: false, note: null, modifiers: [], addedAt: '2026-10-30T15:00:00Z', addedByName: 'Ana', sentAt: null,
  voided: false, voidedAt: null, voidedByName: null, voidReason: null, ...over,
});

describe('mesas y cuentas (Fase 12b-2)', () => {
  it('dice cuánto lleva abierta', () => {
    const now = new Date('2026-10-30T16:10:00Z');
    expect(openFor('2026-10-30T16:05:30Z', now)).toBe('4 min');
    expect(openFor('2026-10-30T15:05:00Z', now)).toBe('1 h 05');
    expect(minutesOpen('2026-10-30T15:40:00Z', now)).toBe(30);
    expect(openFor('2026-10-30T16:20:00Z', now)).toBe('0 min');
  });

  it('nombra el tipo de cuenta con su ícono', () => {
    expect(kindLabel('TAKEAWAY')).toBe('Para llevar');
    expect(kindGlyph('DELIVERY')).toBe('delivery');
    expect(kindGlyph('TABLE')).toBe('tables');
  });

  it('resume las adiciones, el total de la línea y deja fuera lo quitado', () => {
    const withExtras = item({ modifiers: [{ optionId: 'o', groupName: 'Extras', name: 'Tocineta', quantity: 2, price: 3000 }] });
    expect(itemExtras(withExtras)).toBe('Tocineta ×2');
    expect(itemTotal(item())).toBe(36000);
    expect(activeItems([item(), item({ id: 'x', voided: true })]).map((i) => i.id)).toEqual(['i']);
  });
});
