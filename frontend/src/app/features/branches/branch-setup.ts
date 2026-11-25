import { BranchInput, BranchSetupInput, Category } from '../../core/api/api.models';
import { BusinessModule, sortModules } from '../../shared/business-types';

/**
 * Asistente de "Nueva sucursal" (decisión 378). Lo mismo que la principal: otra tienda con el mismo catálogo. Un
 * restaurante: salón con mesas, carta y solo esas categorías en su Vender. Otras cosas: solo las categorías elegidas.
 */
export type BranchKind = 'same' | 'restaurant' | 'other';

export interface SetupDraft {
  kind: BranchKind;
  createRegister: boolean;
  registerName: string;
  tables: number;
  categoryIds: readonly string[];
}

export const MAX_SETUP_TABLES = 60;

export const BRANCH_KINDS: readonly { kind: BranchKind; icon: string; title: string; hint: string }[] = [
  { kind: 'same', icon: 'pi pi-shop', title: 'Vende lo mismo', hint: 'Otro local con los mismos productos.' },
  { kind: 'restaurant', icon: 'pi pi-th-large', title: 'Un restaurante', hint: 'Mesas, cocina y su carta.' },
  { kind: 'other', icon: 'pi pi-tags', title: 'Vende otras cosas', hint: 'Solo las categorías que elijas.' },
];

export function emptyDraft(): SetupDraft {
  return { kind: 'same', createRegister: true, registerName: '', tables: 8, categoryIds: [] };
}

/** "Caja Restaurante Doña Rosa" a partir del nombre de la sucursal. */
export function defaultRegisterName(branchName: string): string {
  const name = branchName.trim();
  return name ? `Caja ${name}`.slice(0, 120) : '';
}

/** Por qué todavía no se puede crear (null = se puede). */
export function setupProblem(draft: SetupDraft): string | null {
  if (draft.createRegister && !draft.registerName.trim()) {
    return 'Escribe el nombre de la caja.';
  }
  if (draft.kind === 'restaurant'
    && (!Number.isInteger(draft.tables) || draft.tables < 1 || draft.tables > MAX_SETUP_TABLES)) {
    return `Las mesas van de 1 a ${MAX_SETUP_TABLES}. Después puedes agregar más.`;
  }
  if (draft.kind === 'other' && draft.categoryIds.length === 0) {
    return 'Elige al menos una categoría que se venda en esta sede.';
  }
  return null;
}

/**
 * Lo que se envía. En un restaurante las categorías elegidas son a la vez su carta y lo que sale en su Vender; sin
 * ninguna elegida vende todo y no se crea carta.
 */
export function setupInput(code: string, branch: BranchInput, draft: SetupDraft): BranchSetupInput {
  const categories = draft.kind === 'same' ? [] : [...draft.categoryIds];
  return {
    ...branch,
    code: code.trim(),
    registerName: draft.createRegister ? draft.registerName.trim() : null,
    zoneName: draft.kind === 'restaurant' ? 'Salón' : null,
    tables: draft.kind === 'restaurant' ? draft.tables : 0,
    menuCategoryIds: draft.kind === 'restaurant' ? categories : [],
    sellsAll: categories.length === 0,
    saleCategoryIds: categories,
  };
}

/** Los módulos del negocio con Mesas y Cocina encendidos (para un restaurante). */
export function withTableModules(modules: readonly BusinessModule[]): BusinessModule[] {
  return sortModules([...modules, 'TABLES', 'KITCHEN']);
}

/** Categorías para elegir: activas, cada subcategoría con su categoría ("Platos › Postres"), por nombre. */
export function categoryOptions(categories: readonly Category[]): { id: string; label: string }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const label = (c: Category): string => {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  return categories.filter((c) => c.active).map((c) => ({ id: c.id, label: label(c) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
