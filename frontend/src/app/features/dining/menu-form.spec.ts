import { DiningMenu } from '../../core/api/dining.api';
import { emptyMenu, menuCategoryFilter, menuContents, menuDraft, menuProblem, toMenuInput } from './menu-form';

const piso2: DiningMenu = {
  id: 'm2', branchId: 'b', name: 'Piso 2', cashRegister: { id: 'c2', name: 'Caja 2' }, position: 1, active: true,
  categories: [{ id: 'k1', name: 'Cócteles' }, { id: 'k2', name: 'Cervezas' }], products: [{ id: 'p1', name: 'Agua' }],
};

describe('cartas por piso (decisión 294)', () => {
  it('pide nombre único, caja y algo que vender', () => {
    const draft = emptyMenu();
    expect(menuProblem(draft, [])).toContain('nombre');
    draft.name = 'piso 2';
    expect(menuProblem(draft, [piso2])).toBe('Ya hay una carta llamada piso 2.');
    draft.name = 'Piso 1';
    expect(menuProblem(draft, [piso2])).toContain('caja');
    draft.cashRegisterId = 'c1';
    expect(menuProblem(draft, [piso2])).toContain('categoría');
    draft.categoryIds = ['k3'];
    expect(menuProblem(draft, [piso2])).toBeNull();
    expect(toMenuInput(draft)).toEqual({ name: 'Piso 1', cashRegisterId: 'c1', active: true, categoryIds: ['k3'], productIds: [] });
  });

  it('lee una carta para editarla y dice qué tiene', () => {
    expect(menuDraft(piso2).products).toEqual([{ id: 'p1', name: 'Agua' }]);
    expect(menuContents(piso2)).toBe('Cócteles, Cervezas y Agua');
    expect(menuContents({ categories: [], products: [] })).toContain('Aún no tiene nada');
  });

  it('al pedir, una carta muestra solo sus categorías; sin carta o inactiva, todas', () => {
    expect(menuCategoryFilter([piso2], 'm2')).toEqual(['k1', 'k2']);
    expect(menuCategoryFilter([piso2], null)).toBeNull();
    expect(menuCategoryFilter([{ ...piso2, active: false }], 'm2')).toBeNull();
  });
});
