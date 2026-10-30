import { PosModifierCatalog, PosModifierGroup } from '../../core/api/modifiers.api';
import {
  chosenModifiers,
  decreaseOption,
  groupRule,
  groupsFor,
  missingGroup,
  repriceModifiers,
  tapOption,
} from './modifier-choice';
import { CartLine } from './sale-math';

const size: PosModifierGroup = {
  id: 'size', name: 'Tamaño', minSelect: 1, maxSelect: 1,
  options: [{ id: 'm', name: 'Mediano', priceDelta: 0, maxQuantity: 1 }, { id: 'g', name: 'Grande', priceDelta: 4000, maxQuantity: 1 }],
};
const extras: PosModifierGroup = {
  id: 'extras', name: 'Extras', minSelect: 0, maxSelect: 3,
  options: [{ id: 's', name: 'Shot extra', priceDelta: 3000, maxQuantity: 2 }, { id: 'h', name: 'Hielo aparte', priceDelta: 0, maxQuantity: 1 }],
};
const catalog: PosModifierCatalog = { groups: [size, extras], products: { granizado: ['size', 'extras'], gaseosa: [] } };

describe('adiciones en el POS (Fase 12b-1)', () => {
  it('toma los grupos del producto en orden', () => {
    expect(groupsFor(catalog, 'granizado').map((g) => g.name)).toEqual(['Tamaño', 'Extras']);
    expect(groupsFor(catalog, 'gaseosa')).toEqual([]);
    expect(groupsFor(null, 'granizado')).toEqual([]);
  });

  it('un grupo de una opción funciona como radio y uno obligatorio no se queda vacío', () => {
    let picks = tapOption(size, new Map(), 'm');
    picks = tapOption(size, picks, 'g');
    expect([...picks.entries()]).toEqual([['g', 1]]);
    expect([...tapOption(size, picks, 'g').entries()]).toEqual([['g', 1]]);
  });

  it('las que se repiten suman hasta su tope y el del grupo, y bajan con −', () => {
    let picks = tapOption(extras, new Map(), 's');
    picks = tapOption(extras, picks, 's');
    expect(picks.get('s')).toBe(2);
    picks = tapOption(extras, picks, 'h');
    expect(picks.get('h')).toBe(1);
    // Tope de la opción alcanzado: tocarla otra vez la quita.
    expect(tapOption(extras, picks, 's').has('s')).toBeFalse();
    expect(decreaseOption(picks, 's').get('s')).toBe(1);
    expect(decreaseOption(new Map([['h', 1]]), 'h').has('h')).toBeFalse();
  });

  it('no deja agregar sin lo obligatorio y arma las adiciones del carrito', () => {
    const groups = groupsFor(catalog, 'granizado');
    expect(missingGroup(groups, new Map([['s', 1]]))?.name).toBe('Tamaño');
    const picks = new Map([['g', 1], ['s', 2]]);
    expect(missingGroup(groups, picks)).toBeNull();
    expect(chosenModifiers(groups, picks)).toEqual([
      { optionId: 'g', groupName: 'Tamaño', name: 'Grande', quantity: 1, price: 4000 },
      { optionId: 's', groupName: 'Extras', name: 'Shot extra', quantity: 2, price: 3000 },
    ]);
    expect(groupRule(size)).toBe('Obligatorio · elige 1');
    expect(groupRule(extras)).toBe('Opcional · hasta 3');
  });

  it('al retomar una venta actualiza los precios o avisa si la adición ya no existe', () => {
    const line: CartLine = {
      key: 'k', productId: 'granizado', sku: 'G', name: 'Granizado', unitId: 'u', unitCode: 'UND', quantity: 1,
      unitPrice: 12000, discountPercent: 0, taxRate: 0, trackInventory: false,
      modifiers: [{ optionId: 'g', groupName: 'Tamaño', name: 'Grande', quantity: 1, price: 3500 }],
    };
    expect(repriceModifiers(line, catalog)?.modifiers?.[0].price).toBe(4000);
    expect(repriceModifiers({ ...line, modifiers: [{ ...line.modifiers![0], optionId: 'x' }] }, catalog)).toBeNull();
  });
});
