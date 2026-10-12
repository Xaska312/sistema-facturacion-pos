/**
 * Paleta cerrada de colores de marca (fase 8c). Cada color tiene su bloque en src/styles.css
 * (:root[data-brand="…"], claro y oscuro) con el contraste revisado (texto ≥ 4,5:1 en claro y en oscuro). Los
 * valores de aquí solo pintan las muestras en Ajustes y deben coincidir con los de styles.css.
 */
export const BRAND_PALETTES = [
  { id: 'turquesa', label: 'Turquesa', light: '#0f766e', dark: '#2dd4bf' },
  { id: 'azul', label: 'Azul', light: '#1d4ed8', dark: '#60a5fa' },
  { id: 'indigo', label: 'Índigo', light: '#4338ca', dark: '#818cf8' },
  { id: 'violeta', label: 'Violeta', light: '#6d28d9', dark: '#a78bfa' },
  { id: 'rosa', label: 'Rosa', light: '#be185d', dark: '#f472b6' },
  { id: 'naranja', label: 'Naranja', light: '#c2410c', dark: '#fb923c' },
  { id: 'verde', label: 'Verde', light: '#047857', dark: '#34d399' },
  { id: 'grafito', label: 'Grafito', light: '#334155', dark: '#94a3b8' },
] as const;

export type BrandColor = (typeof BRAND_PALETTES)[number]['id'];

export const DEFAULT_BRAND: BrandColor = 'turquesa';

/** Aplica el color en la página (atributo data-brand en <html>); turquesa es el de siempre y no lleva atributo. */
export function applyBrandColor(color: string | null | undefined, root: HTMLElement = document.documentElement): void {
  if (color && color !== DEFAULT_BRAND && BRAND_PALETTES.some((p) => p.id === color)) {
    root.dataset['brand'] = color;
  } else {
    delete root.dataset['brand'];
  }
}
