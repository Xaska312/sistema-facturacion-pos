import {
  categoryOptions, defaultRegisterName, emptyDraft, setupInput, setupProblem, toggleId, withTableModules,
} from './branch-setup';

const BRANCH = { name: 'Restaurante Doña Rosa', address: null, cityCode: null, phone: null };

describe('branch-setup (decisión 378)', () => {
  it('names the register after the branch', () => {
    expect(defaultRegisterName('  Restaurante Doña Rosa ')).toBe('Caja Restaurante Doña Rosa');
    expect(defaultRegisterName('')).toBe('');
  });

  it('a branch that sells the same only gets its register', () => {
    const input = setupInput(' norte ', BRANCH, { ...emptyDraft(), registerName: 'Caja Norte', categoryIds: ['x'] });
    expect(input).toEqual(jasmine.objectContaining({
      code: 'norte', registerName: 'Caja Norte', tables: 0, zoneName: null, menuCategoryIds: [], sellsAll: true,
      saleCategoryIds: [],
    }));
  });

  it('a restaurant gets its salon, and its categories are both the menu and what it sells', () => {
    const input = setupInput('REST', BRANCH, {
      kind: 'restaurant', createRegister: true, registerName: 'Caja Restaurante', tables: 8, categoryIds: ['platos', 'jugos'],
    });
    expect(input).toEqual(jasmine.objectContaining({
      tables: 8, zoneName: 'Salón', menuCategoryIds: ['platos', 'jugos'], sellsAll: false,
      saleCategoryIds: ['platos', 'jugos'],
    }));
    const noMenu = setupInput('REST', BRANCH, { ...emptyDraft(), kind: 'restaurant', createRegister: false, tables: 4 });
    expect(noMenu.sellsAll).toBeTrue();
    expect(noMenu.registerName).toBeNull();
  });

  it('says why it cannot be created yet', () => {
    expect(setupProblem({ ...emptyDraft(), registerName: ' ' })).toContain('nombre de la caja');
    expect(setupProblem({ ...emptyDraft(), createRegister: false, kind: 'restaurant', tables: 0 })).toContain('1 a 60');
    expect(setupProblem({ ...emptyDraft(), createRegister: false, kind: 'restaurant', tables: 2.5 })).toContain('1 a 60');
    expect(setupProblem({ ...emptyDraft(), createRegister: false, kind: 'other' })).toContain('al menos una categoría');
    expect(setupProblem({ ...emptyDraft(), createRegister: false, kind: 'other', categoryIds: ['a'] })).toBeNull();
  });

  it('turns on tables and kitchen keeping the other modules', () => {
    expect(withTableModules(['CREDIT'])).toEqual(['CREDIT', 'TABLES', 'KITCHEN']);
    expect(withTableModules(['TABLES', 'KITCHEN'])).toEqual(['TABLES', 'KITCHEN']);
  });

  it('lists active categories with their parent, by name', () => {
    expect(categoryOptions([
      { id: 'p', parentId: null, name: 'Platos', active: true },
      { id: 'd', parentId: 'p', name: 'Postres', active: true },
      { id: 'a', parentId: null, name: 'Aseo', active: true },
      { id: 'x', parentId: null, name: 'Viejos', active: false },
    ])).toEqual([
      { id: 'a', label: 'Aseo' }, { id: 'p', label: 'Platos' }, { id: 'd', label: 'Platos › Postres' },
    ]);
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});
