import { Category } from '../../core/api/api.models';
import { categoryTree, descendantsOf } from './catalog-settings.component';

function cat(id: string, name: string, parentId: string | null = null): Category {
  return { id, name, parentId, active: true };
}

describe('categoryTree', () => {
  it('ordena padre seguido de sus hijas con su profundidad', () => {
    const tree = categoryTree([cat('3', 'Gaseosas', '1'), cat('1', 'Bebidas'), cat('2', 'Aseo'), cat('4', 'Aguas', '1')]);
    expect(tree.map((n) => `${n.depth}:${n.category.name}`)).toEqual(['0:Aseo', '0:Bebidas', '1:Aguas', '1:Gaseosas']);
  });

  it('trata como raíz a una categoría cuyo padre no está en la lista', () => {
    const tree = categoryTree([cat('5', 'Huérfana', 'no-existe')]);
    expect(tree[0].depth).toBe(0);
  });
});

describe('descendantsOf', () => {
  it('incluye la categoría y todas sus descendientes', () => {
    const all = [cat('1', 'A'), cat('2', 'B', '1'), cat('3', 'C', '2'), cat('4', 'D')];
    expect([...descendantsOf(all, '1')].sort()).toEqual(['1', '2', '3']);
    expect(descendantsOf(all, null).size).toBe(0);
  });
});
