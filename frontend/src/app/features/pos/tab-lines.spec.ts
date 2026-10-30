import { Tab } from '../../core/api/dining.api';
import { tabLines } from './tab-lines';

const tab = {
  id: 't', number: 3, kind: 'TABLE', status: 'OPEN', label: 'Mesa 4', branchId: 'b', tableId: 'm4', tableName: '4',
  zoneName: 'Salón', guests: 2, customerName: null, phone: null, address: null, notes: null,
  openedAt: '2026-10-30T15:00:00Z', openedByName: 'Ana', closedAt: null, saleId: null, total: 60000,
  items: [
    { id: 'i1', position: 1, productId: 'hamb', unitId: 'und', name: 'Hamburguesa', quantity: 2, unitPrice: 21000,
      basePrice: 18000, openPrice: false, note: 'sin cebolla',
      modifiers: [{ optionId: 'o', groupName: 'Extras', name: 'Tocineta', quantity: 1, price: 3000 }],
      addedAt: '', addedByName: null, sentAt: null, ticketNumber: null, stationName: null, voided: false, voidedAt: null, voidedByName: null, voidReason: null, saleId: null },
    { id: 'i2', position: 2, productId: 'varios', unitId: 'und', name: 'Domicilio', quantity: 1, unitPrice: 5000,
      basePrice: 5000, openPrice: true, note: null, modifiers: [], addedAt: '', addedByName: null, sentAt: null, ticketNumber: null, stationName: null,
      voided: false, voidedAt: null, voidedByName: null, voidReason: null, saleId: null },
    { id: 'i3', position: 3, productId: 'gaseosa', unitId: 'und', name: 'Gaseosa', quantity: 1, unitPrice: 4000,
      basePrice: 4000, openPrice: false, note: null, modifiers: [], addedAt: '', addedByName: null, sentAt: null, ticketNumber: null, stationName: null,
      voided: true, voidedAt: '', voidedByName: 'Ana', voidReason: 'no la quiso', saleId: null },
  ],
} as Tab;

describe('cobro de una cuenta en Vender (Fase 12b-2)', () => {
  it('lleva lo vigente de la cuenta al carrito con adiciones, nota y precio libre', () => {
    const lines = tabLines(tab);
    expect(lines.map((l) => l.key)).toEqual(['i1', 'i2']);
    expect(lines[0]).toEqual(jasmine.objectContaining({ productId: 'hamb', quantity: 2, unitPrice: 18000, note: 'sin cebolla' }));
    expect(lines[0].modifiers?.[0]).toEqual({ optionId: 'o', groupName: 'Extras', name: 'Tocineta', quantity: 1, price: 3000 });
    expect(lines[1].openPrice).toBeTrue();
    expect(lines[1].unitPrice).toBe(5000);
  });
});

describe('cobro por productos (Fase 12b-5)', () => {
  it('solo lo pendiente y, con partes, solo esas líneas y cantidades', () => {
    const charged = { ...tab, items: tab.items.map((i) => (i.id === 'i2' ? { ...i, saleId: 's1' } : i)) } as Tab;
    expect(tabLines(charged).map((l) => l.key)).toEqual(['i1']);
    const lines = tabLines(tab, [{ itemId: 'i1', quantity: 1 }]);
    expect(lines.map((l) => [l.key, l.quantity])).toEqual([['i1', 1]]);
  });
});
