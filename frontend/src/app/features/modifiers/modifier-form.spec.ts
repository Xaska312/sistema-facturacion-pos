import { ModifierGroup } from '../../core/api/modifiers.api';
import { appliesTo, draftFrom, draftProblem, emptyDraft, ruleLabel, toInput } from './modifier-form';

const group: ModifierGroup = {
  id: 'g1', name: 'Extras', minSelect: 0, maxSelect: 4, active: true,
  options: [{ id: 'o1', name: 'Shot extra', priceDelta: 3000, maxQuantity: 3, active: true },
    { id: 'o2', name: 'Sin licor', priceDelta: -2000, maxQuantity: 1, active: false }],
  products: [{ id: 'p1', name: 'Granizado de mango' }],
  categories: [{ id: 'c1', name: 'Granizados' }, { id: 'c2', name: 'Cocteles' }],
};

describe('editor de adiciones (Fase 12b-1)', () => {
  it('traduce "una o varias" y "obligatorio" a mínimo y máximo', () => {
    const draft = emptyDraft();
    draft.name = ' Tamaño ';
    draft.options = [{ id: null, name: 'Mediano', priceDelta: 0, maxQuantity: 3, active: true },
      { id: null, name: 'Grande', priceDelta: 4000, maxQuantity: 1, active: true },
      { id: null, name: '  ', priceDelta: 0, maxQuantity: 1, active: true }];
    draft.categoryIds = ['c1'];
    expect(draftProblem(draft)).toBeNull();
    expect(toInput(draft)).toEqual({
      name: 'Tamaño', minSelect: 1, maxSelect: 1, active: true,
      options: [{ id: null, name: 'Mediano', priceDelta: 0, maxQuantity: 1, active: true },
        { id: null, name: 'Grande', priceDelta: 4000, maxQuantity: 1, active: true }],
      productIds: [], categoryIds: ['c1'],
    });
  });

  it('un grupo existente vuelve al editor tal como está', () => {
    const input = toInput(draftFrom(group));
    expect(input.minSelect).toBe(0);
    expect(input.maxSelect).toBe(4);
    expect(input.options.map((o) => [o.id, o.maxQuantity, o.active])).toEqual([['o1', 3, true], ['o2', 1, false]]);
    expect(input.productIds).toEqual(['p1']);
  });

  it('avisa lo que falta antes de guardar', () => {
    const draft = emptyDraft();
    expect(draftProblem(draft)).toContain('nombre');
    draft.name = 'Salsas';
    expect(draftProblem(draft)).toBe('Agrega al menos una opción.');
    draft.options = [{ id: null, name: 'Rosada', priceDelta: 0, maxQuantity: 1, active: true },
      { id: null, name: 'rosada', priceDelta: 0, maxQuantity: 1, active: true }];
    expect(draftProblem(draft)).toContain('mismo nombre');
    draft.options[1].name = 'Tártara';
    draft.options[1].priceDelta = 500.5;
    expect(draftProblem(draft)).toContain('pesos enteros');
  });

  it('describe la regla y a qué se aplica', () => {
    expect(ruleLabel(group)).toBe('Opcional · Hasta 4');
    expect(ruleLabel({ minSelect: 1, maxSelect: 1 })).toBe('Obligatorio · Se elige una');
    expect(appliesTo(group)).toBe('Granizados, Cocteles y Granizado de mango');
    expect(appliesTo({ categories: [], products: [] })).toBe('Aún no se aplica a ningún producto');
  });
});
