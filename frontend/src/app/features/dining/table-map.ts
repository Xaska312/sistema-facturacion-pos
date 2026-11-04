import { MapSpot, TabState, TableShape } from '../../core/api/dining.api';

/**
 * Mapa de mesas (decisión 284): un plano de 100 × 70 unidades por zona (así se ve igual en cualquier pantalla), cada
 * mesa con su lugar, tamaño y forma, y su color según en qué va.
 */
export const PLAN_W = 100;
export const PLAN_H = 70;
export const MIN_SIZE = 4;
export const MAX_SIZE = 40;
export const DEFAULT_SIZE = 12;

/** Estado de una mesa en el mapa: libre o el de su cuenta. */
export type MapState = 'FREE' | TabState;

export const MAP_STATES: readonly { state: MapState; label: string; hint: string }[] = [
  { state: 'FREE', label: 'Libre', hint: 'Toca para abrir la cuenta' },
  { state: 'ORDERING', label: 'Pidiendo', hint: 'Ocupada, aún no pide a cocina' },
  { state: 'KITCHEN', label: 'En cocina', hint: 'Su pedido se está preparando' },
  { state: 'READY', label: 'Para llevar', hint: 'Hay platos listos en la cocina' },
  { state: 'EATING', label: 'Comiendo', hint: 'Ya tiene todo servido' },
  { state: 'BILL', label: 'Pidió la cuenta', hint: 'Cóbrala' },
];

export function stateLabel(state: MapState): string {
  return MAP_STATES.find((s) => s.state === state)?.label ?? state;
}

/** Una mesa ubicada en el plano (con lugar seguro, aunque no lo tuviera guardado). */
export interface PlacedTable<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: TableShape;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Lugar seguro: dentro del plano y con el tamaño entre los límites (redonda y cuadrada: igual de ancha que alta). */
export function normalizeSpot(spot: MapSpot): { x: number | null; y: number | null; w: number; h: number; shape: TableShape } {
  const shape = spot.shape ?? 'SQUARE';
  const w = clamp(Number(spot.w) || DEFAULT_SIZE, MIN_SIZE, MAX_SIZE);
  const h = shape === 'RECT' ? clamp(Number(spot.h) || w, MIN_SIZE, MAX_SIZE) : w;
  if (spot.x === null || spot.y === null || spot.x === undefined || spot.y === undefined) {
    return { x: null, y: null, w, h, shape };
  }
  return { x: clamp(Number(spot.x), 0, PLAN_W - w), y: clamp(Number(spot.y), 0, PLAN_H - h), w, h, shape };
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Ubica las mesas: las que tienen lugar se quedan; las demás se acomodan en filas, en el primer hueco libre (de
 * izquierda a derecha y de arriba abajo), sin pisar a las que ya están.
 */
export function placeTables<T>(items: readonly T[], spotOf: (item: T) => MapSpot): PlacedTable<T>[] {
  const placed: PlacedTable<T>[] = [];
  const pending: { item: T; w: number; h: number; shape: TableShape }[] = [];
  for (const item of items) {
    const s = normalizeSpot(spotOf(item));
    if (s.x === null || s.y === null) {
      pending.push({ item, w: s.w, h: s.h, shape: s.shape });
    } else {
      placed.push({ item, x: s.x, y: s.y, w: s.w, h: s.h, shape: s.shape });
    }
  }
  const gap = 3;
  for (const p of pending) {
    let spot: { x: number; y: number } | null = null;
    for (let y = gap; y + p.h <= PLAN_H && !spot; y += 1) {
      for (let x = gap; x + p.w <= PLAN_W; x += 1) {
        const box = { x: x - gap / 2, y: y - gap / 2, w: p.w + gap, h: p.h + gap };
        if (!placed.some((q) => overlaps(box, q))) {
          spot = { x, y };
          break;
        }
      }
    }
    // Plano lleno: se deja arriba a la izquierda (el dueño la mueve).
    placed.push({ item: p.item, x: spot?.x ?? 0, y: spot?.y ?? 0, w: p.w, h: p.h, shape: p.shape });
  }
  return placed;
}

/** Posición en % del contenedor (el plano mantiene la proporción 100 × 70). */
export function boxStyle(t: { x: number; y: number; w: number; h: number }): Record<string, string> {
  return {
    left: `${(t.x / PLAN_W) * 100}%`,
    top: `${(t.y / PLAN_H) * 100}%`,
    width: `${(t.w / PLAN_W) * 100}%`,
    height: `${(t.h / PLAN_H) * 100}%`,
  };
}

/** Mueve una mesa {@code dx, dy} unidades (redondeado a 0,5) sin salirse del plano. */
export function moveBy(t: { x: number; y: number; w: number; h: number }, dx: number, dy: number): { x: number; y: number } {
  const snap = (v: number) => Math.round(v * 2) / 2;
  return { x: clamp(snap(t.x + dx), 0, PLAN_W - t.w), y: clamp(snap(t.y + dy), 0, PLAN_H - t.h) };
}

/** Cambia el tamaño o la forma y la mantiene dentro del plano. */
export function resize<T extends { x: number; y: number; w: number; h: number; shape: TableShape }>(t: T, w: number,
                                                                                                  h: number, shape: TableShape): T {
  const nw = clamp(Math.round(w), MIN_SIZE, MAX_SIZE);
  const nh = shape === 'RECT' ? clamp(Math.round(h), MIN_SIZE, MAX_SIZE) : nw;
  return { ...t, w: nw, h: nh, shape, x: clamp(t.x, 0, PLAN_W - nw), y: clamp(t.y, 0, PLAN_H - nh) };
}
