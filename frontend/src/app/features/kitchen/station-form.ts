import { KitchenStation, StationInput, StationRef } from '../../core/api/kitchen.api';

/** Borrador del editor de una estación de cocina (Fase 12b-3). */
export interface StationDraft {
  name: string;
  main: boolean;
  active: boolean;
  categoryIds: string[];
  products: StationRef[];
}

export function emptyStation(): StationDraft {
  return { name: '', main: false, active: true, categoryIds: [], products: [] };
}

export function stationDraft(station: KitchenStation): StationDraft {
  return {
    name: station.name,
    main: station.main,
    active: station.active,
    categoryIds: station.categories.map((c) => c.id),
    products: station.products.map((p) => ({ id: p.id, name: p.name })),
  };
}

export function stationProblem(draft: StationDraft, others: readonly KitchenStation[]): string | null {
  const name = draft.name.trim();
  if (!name) {
    return 'Escribe el nombre de la estación (por ejemplo, Bar o Parrilla).';
  }
  if (name.length > 40) {
    return 'El nombre admite hasta 40 caracteres.';
  }
  if (others.some((s) => s.name.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
    return `Ya hay una estación llamada ${name}.`;
  }
  return null;
}

export function toStationInput(draft: StationDraft): StationInput {
  return {
    name: draft.name.trim(),
    main: draft.main,
    // La principal recibe lo que no tiene otra estación: siempre activa.
    active: draft.main || draft.active,
    categoryIds: [...draft.categoryIds],
    productIds: draft.products.map((p) => p.id),
  };
}

/** "Bebidas, Licores y 3 productos" o lo que recibe la principal. */
export function stationReceives(station: Pick<KitchenStation, 'main' | 'categories' | 'products'>): string {
  const parts = station.categories.map((c) => c.name);
  if (station.products.length > 0) {
    parts.push(station.products.length === 1 ? station.products[0].name : `${station.products.length} productos`);
  }
  const list = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  if (station.main) {
    return list ? `${list} y todo lo que no tenga otra estación` : 'Todo lo que no tenga otra estación';
  }
  return list || 'Aún no recibe nada: asígnale categorías o productos';
}
