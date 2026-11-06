import { DiningMenu, DiningMenuInput } from '../../core/api/dining.api';

/** Borrador del editor de una carta por piso (decisión 294). */
export interface MenuDraft {
  name: string;
  cashRegisterId: string;
  active: boolean;
  categoryIds: string[];
  products: { id: string; name: string }[];
}

export function emptyMenu(cashRegisterId = ''): MenuDraft {
  return { name: '', cashRegisterId, active: true, categoryIds: [], products: [] };
}

export function menuDraft(menu: DiningMenu): MenuDraft {
  return {
    name: menu.name,
    cashRegisterId: menu.cashRegister.id,
    active: menu.active,
    categoryIds: menu.categories.map((c) => c.id),
    products: menu.products.map((p) => ({ id: p.id, name: p.name })),
  };
}

export function menuProblem(draft: MenuDraft, others: readonly DiningMenu[]): string | null {
  const name = draft.name.trim();
  if (!name) {
    return 'Escribe el nombre de la carta (por ejemplo, Piso 1 o Bar).';
  }
  if (name.length > 40) {
    return 'El nombre admite hasta 40 caracteres.';
  }
  if (others.some((m) => m.name.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
    return `Ya hay una carta llamada ${name}.`;
  }
  if (!draft.cashRegisterId) {
    return 'Elige en qué caja se cobra esta carta.';
  }
  if (draft.categoryIds.length === 0 && draft.products.length === 0) {
    return 'Elige al menos una categoría o un producto de esta carta.';
  }
  return null;
}

export function toMenuInput(draft: MenuDraft): DiningMenuInput {
  return {
    name: draft.name.trim(),
    cashRegisterId: draft.cashRegisterId,
    active: draft.active,
    categoryIds: [...draft.categoryIds],
    productIds: draft.products.map((p) => p.id),
  };
}

/** "Cócteles, Cervezas y 2 productos". */
export function menuContents(menu: Pick<DiningMenu, 'categories' | 'products'>): string {
  const parts = menu.categories.map((c) => c.name);
  if (menu.products.length > 0) {
    parts.push(menu.products.length === 1 ? menu.products[0].name : `${menu.products.length} productos`);
  }
  if (parts.length === 0) {
    return 'Aún no tiene nada: asígnale categorías o productos';
  }
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** Categorías que se ven al pedir con una carta elegida: las suyas (null = todas). */
export function menuCategoryFilter(menus: readonly DiningMenu[], chosen: string | null): string[] | null {
  const menu = chosen ? menus.find((m) => m.id === chosen && m.active) : undefined;
  return menu ? menu.categories.map((c) => c.id) : null;
}

const MENU_KEY = 'xaska.dining.menu';

/** La carta que se eligió en este equipo (el mesero del segundo piso no la elige cada vez). */
export function loadMenuChoice(): string | null {
  try {
    return globalThis.localStorage?.getItem(MENU_KEY) || null;
  } catch {
    return null;
  }
}

export function saveMenuChoice(id: string | null): void {
  try {
    if (id) {
      globalThis.localStorage?.setItem(MENU_KEY, id);
    } else {
      globalThis.localStorage?.removeItem(MENU_KEY);
    }
  } catch {
    // Sin almacenamiento: vale mientras la pestaña siga abierta.
  }
}
