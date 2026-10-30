import { ModifierGroup, ModifierGroupInput } from '../../core/api/modifiers.api';

/**
 * Borrador del editor de un grupo de adiciones (Fase 12b-1). La pantalla habla de "una opción" o "varias" y de
 * "obligatorio"; aquí se traduce a mínimo y máximo, como los guarda el servidor.
 */
export interface OptionDraft {
  id: string | null;
  name: string;
  priceDelta: number | null;
  maxQuantity: number;
  active: boolean;
}

export interface GroupDraft {
  name: string;
  /** Se eligen varias (con tope {@code max}) o una sola. */
  multiple: boolean;
  max: number;
  required: boolean;
  active: boolean;
  options: OptionDraft[];
  categoryIds: string[];
  products: { id: string; name: string }[];
}

export function emptyDraft(): GroupDraft {
  return {
    name: '', multiple: false, max: 3, required: true, active: true,
    options: [newOption(), newOption()], categoryIds: [], products: [],
  };
}

export function newOption(): OptionDraft {
  return { id: null, name: '', priceDelta: 0, maxQuantity: 1, active: true };
}

export function draftFrom(group: ModifierGroup): GroupDraft {
  return {
    name: group.name,
    multiple: group.maxSelect > 1,
    max: Math.max(group.maxSelect, 2),
    required: group.minSelect > 0,
    active: group.active,
    options: group.options.map((o) => ({ id: o.id, name: o.name, priceDelta: Number(o.priceDelta), maxQuantity: o.maxQuantity,
      active: o.active })),
    categoryIds: group.categories.map((c) => c.id),
    products: group.products.map((p) => ({ id: p.id, name: p.name })),
  };
}

/** Las opciones sin nombre se ignoran (filas vacías del editor). */
export function filledOptions(draft: GroupDraft): OptionDraft[] {
  return draft.options.filter((o) => o.name.trim() !== '');
}

/** Primer problema del borrador para el aviso del diálogo, o null si se puede guardar. */
export function draftProblem(draft: GroupDraft): string | null {
  if (!draft.name.trim()) {
    return 'Escribe el nombre del grupo (por ejemplo, Tamaño o Extras).';
  }
  const options = filledOptions(draft);
  if (options.length === 0) {
    return 'Agrega al menos una opción.';
  }
  const names = options.map((o) => o.name.trim().toLocaleLowerCase('es'));
  if (new Set(names).size !== names.length) {
    return 'Hay opciones con el mismo nombre.';
  }
  if (options.some((o) => o.priceDelta === null || !Number.isInteger(Number(o.priceDelta)))) {
    return 'El precio de cada opción va en pesos enteros (0 si no cambia el precio).';
  }
  if (draft.multiple && !(draft.max >= 2 && draft.max <= 20)) {
    return 'Cuando se eligen varias, el máximo va de 2 a 20.';
  }
  if (draft.required && draft.active && !options.some((o) => o.active)) {
    return 'Un grupo obligatorio necesita al menos una opción activa.';
  }
  return null;
}

export function toInput(draft: GroupDraft): ModifierGroupInput {
  const max = draft.multiple ? draft.max : 1;
  return {
    name: draft.name.trim(),
    minSelect: draft.required ? 1 : 0,
    maxSelect: max,
    active: draft.active,
    options: filledOptions(draft).map((o) => ({
      id: o.id,
      name: o.name.trim(),
      priceDelta: Number(o.priceDelta),
      maxQuantity: draft.multiple ? Math.min(Math.max(Number(o.maxQuantity) || 1, 1), 10) : 1,
      active: o.active,
    })),
    productIds: draft.products.map((p) => p.id),
    categoryIds: [...draft.categoryIds],
  };
}

/** Resumen de la regla del grupo para su tarjeta. */
export function ruleLabel(group: Pick<ModifierGroup, 'minSelect' | 'maxSelect'>): string {
  const how = group.maxSelect === 1 ? 'Se elige una' : `Hasta ${group.maxSelect}`;
  return `${group.minSelect > 0 ? 'Obligatorio' : 'Opcional'} · ${how}`;
}

/** "Granizados, Bebidas y 3 productos". */
export function appliesTo(group: Pick<ModifierGroup, 'categories' | 'products'>): string {
  const parts = group.categories.map((c) => c.name);
  if (group.products.length > 0) {
    parts.push(group.products.length === 1 ? group.products[0].name : `${group.products.length} productos`);
  }
  if (parts.length === 0) {
    return 'Aún no se aplica a ningún producto';
  }
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** Plantilla para crear un grupo común con un toque (Fase 12b-3): se abre en el editor para ajustarla. */
export interface GroupTemplate {
  key: string;
  label: string;
  /** Lo que trae, para la ficha. */
  hint: string;
  build(): GroupDraft;
}

function templateDraft(name: string, options: string[], multiple: boolean, required: boolean, max = 3): GroupDraft {
  return {
    ...emptyDraft(),
    name, multiple, required, max,
    options: options.map((o) => ({ ...newOption(), name: o })),
  };
}

export const GROUP_TEMPLATES: readonly GroupTemplate[] = [
  { key: 'term', label: 'Término de la carne', hint: 'Azul, medio, tres cuartos, bien asado · obligatorio',
    build: () => templateDraft('Término', ['Azul', 'Medio', 'Tres cuartos', 'Bien asado'], false, true) },
  { key: 'size', label: 'Tamaño', hint: 'Personal, mediano, grande · pon el precio de cada uno',
    build: () => templateDraft('Tamaño', ['Personal', 'Mediano', 'Grande'], false, true) },
  { key: 'sauces', label: 'Salsas', hint: 'Rosada, BBQ, tártara, ajo, piña · hasta 3',
    build: () => templateDraft('Salsas', ['Rosada', 'BBQ', 'Tártara', 'Ajo', 'Piña'], true, false, 3) },
  { key: 'without', label: 'Sin…', hint: 'Sin cebolla, sin tomate, sin lechuga, sin salsas · varias',
    build: () => templateDraft('Sin', ['Sin cebolla', 'Sin tomate', 'Sin lechuga', 'Sin salsas', 'Sin queso'], true, false, 5) },
];
