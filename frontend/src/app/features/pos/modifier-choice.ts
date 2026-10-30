import { PosModifierCatalog, PosModifierGroup } from '../../core/api/modifiers.api';
import { CartLine, CartModifier } from './sale-math';

/**
 * Elección de adiciones de un producto (Fase 12b-1, decisión 268). Replica las reglas del servidor
 * (ModifierChoices.java) para no dejar agregar una línea que se rechazaría al cobrar.
 */

/** Veces que se eligió cada opción (id de la opción → cantidad). */
export type ModifierPicks = ReadonlyMap<string, number>;

export const MAX_NOTE = 140;

/** Grupos que aplican a un producto, en el orden en que se eligen. */
export function groupsFor(catalog: PosModifierCatalog | null, productId: string): PosModifierGroup[] {
  if (!catalog) {
    return [];
  }
  const ids = catalog.products[productId] ?? [];
  return ids.map((id) => catalog.groups.find((g) => g.id === id)).filter((g): g is PosModifierGroup => g !== undefined);
}

/** Unidades elegidas en un grupo ("Shot extra ×2" cuenta 2). */
export function groupUnits(group: PosModifierGroup, picks: ModifierPicks): number {
  return group.options.reduce((sum, o) => sum + (picks.get(o.id) ?? 0), 0);
}

/**
 * Tocar una opción. En un grupo de una sola opción, la reemplaza (radio). En uno de varias, suma una vez más hasta su
 * tope y el del grupo; si ya está en su tope, la quita.
 */
export function tapOption(group: PosModifierGroup, picks: ModifierPicks, optionId: string): Map<string, number> {
  const next = new Map(picks);
  const option = group.options.find((o) => o.id === optionId);
  if (!option) {
    return next;
  }
  const current = next.get(optionId) ?? 0;
  if (group.maxSelect === 1) {
    group.options.forEach((o) => next.delete(o.id));
    if (current === 0 || group.minSelect > 0) {
      next.set(optionId, 1);
    }
    return next;
  }
  const roomInGroup = groupUnits(group, picks) < group.maxSelect;
  if (current < option.maxQuantity && roomInGroup) {
    next.set(optionId, current + 1);
  } else {
    next.delete(optionId);
  }
  return next;
}

/** Una vez menos de una opción (el "−" de las que se repiten). */
export function decreaseOption(picks: ModifierPicks, optionId: string): Map<string, number> {
  const next = new Map(picks);
  const current = next.get(optionId) ?? 0;
  if (current <= 1) {
    next.delete(optionId);
  } else {
    next.set(optionId, current - 1);
  }
  return next;
}

/** Primer grupo obligatorio sin completar, o null si ya se puede agregar. */
export function missingGroup(groups: readonly PosModifierGroup[], picks: ModifierPicks): PosModifierGroup | null {
  return groups.find((g) => groupUnits(g, picks) < g.minSelect) ?? null;
}

/** Lo elegido, en el orden de los grupos y sus opciones, con nombre y precio para el carrito. */
export function chosenModifiers(groups: readonly PosModifierGroup[], picks: ModifierPicks): CartModifier[] {
  const result: CartModifier[] = [];
  for (const g of groups) {
    for (const o of g.options) {
      const quantity = picks.get(o.id) ?? 0;
      if (quantity > 0) {
        result.push({ optionId: o.id, groupName: g.name, name: o.name, quantity, price: Number(o.priceDelta) });
      }
    }
  }
  return result;
}

/** Texto de la regla del grupo: "Obligatorio · elige 1", "Opcional · hasta 4". */
export function groupRule(group: PosModifierGroup): string {
  if (group.minSelect > 0) {
    return group.minSelect === group.maxSelect
      ? `Obligatorio · elige ${group.minSelect}`
      : `Obligatorio · de ${group.minSelect} a ${group.maxSelect}`;
  }
  return group.maxSelect === 1 ? 'Opcional · máximo 1' : `Opcional · hasta ${group.maxSelect}`;
}

/**
 * Al retomar una venta en espera: actualiza el precio de cada adición con el vigente. Null si alguna ya no existe
 * (hay que volver a elegirlas).
 */
export function repriceModifiers(line: CartLine, catalog: PosModifierCatalog): CartLine | null {
  if (!line.modifiers?.length) {
    return line;
  }
  const options = new Map(catalog.groups.flatMap((g) => g.options.map((o) => [o.id, o] as const)));
  const updated: CartModifier[] = [];
  for (const m of line.modifiers) {
    const option = options.get(m.optionId);
    if (!option) {
      return null;
    }
    updated.push({ ...m, name: option.name, price: Number(option.priceDelta) });
  }
  return { ...line, modifiers: updated };
}
