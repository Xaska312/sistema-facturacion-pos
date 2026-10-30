import { addPending, pendingTotal, stepPending, toItemInputs } from './pending-items';

const burger = { productId: 'h', unitId: 'u', name: 'Hamburguesa', quantity: 1, basePrice: 18000, openPrice: false,
  modifiers: [] as { optionId: string; groupName: string; name: string; quantity: number; price: number }[], note: '' };

describe('pedido por agregar a la cuenta (Fase 12b-2)', () => {
  it('suma el mismo producto y separa otras adiciones o nota', () => {
    let list = addPending([], burger);
    list = addPending(list, burger);
    list = addPending(list, { ...burger, note: 'sin cebolla' });
    list = addPending(list, { ...burger, modifiers: [{ optionId: 't', groupName: 'Extras', name: 'Tocineta', quantity: 1, price: 3000 }] });
    expect(list.map((p) => p.quantity)).toEqual([2, 1, 1]);
    expect(pendingTotal(list)).toBe(18000 * 3 + 21000);
  });

  it('baja hasta quitar y arma lo que se envía', () => {
    let list = addPending([], { ...burger, note: 'sin cebolla' });
    list = addPending(list, { ...burger, productId: 'v', name: 'Varios', openPrice: true, basePrice: 7000 });
    expect(stepPending(list, list[0].key, -1).length).toBe(1);
    expect(toItemInputs(list)).toEqual([
      { productId: 'h', unitId: 'u', quantity: 1, note: 'sin cebolla' },
      { productId: 'v', unitId: 'u', quantity: 1, unitPrice: 7000 },
    ]);
  });
});
