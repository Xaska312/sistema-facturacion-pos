import { signal } from '@angular/core';

/**
 * Paleta cerrada de colores de marca (fase 8c). Cada color tiene su bloque en src/styles.css
 * (:root[data-brand="…"], claro y oscuro) con el contraste revisado (texto ≥ 4,5:1 en claro y en oscuro). Los
 * valores de aquí solo pintan las muestras en Ajustes y deben coincidir con los de styles.css.
 * Índigo (el color de XASKA) es el de :root y va primero; los negocios que no eligieron color lo usan.
 */
export const BRAND_PALETTES = [
  { id: 'indigo', label: 'Índigo', light: '#4338ca', dark: '#818cf8' },
  { id: 'turquesa', label: 'Turquesa', light: '#0f766e', dark: '#2dd4bf' },
  { id: 'azul', label: 'Azul', light: '#1d4ed8', dark: '#60a5fa' },
  { id: 'violeta', label: 'Violeta', light: '#6d28d9', dark: '#a78bfa' },
  { id: 'rosa', label: 'Rosa', light: '#be185d', dark: '#f472b6' },
  { id: 'naranja', label: 'Naranja', light: '#c2410c', dark: '#fb923c' },
  { id: 'verde', label: 'Verde', light: '#047857', dark: '#34d399' },
  { id: 'grafito', label: 'Grafito', light: '#334155', dark: '#94a3b8' },
] as const;

export type BrandColor = (typeof BRAND_PALETTES)[number]['id'];

export const DEFAULT_BRAND: BrandColor = 'indigo';

/** Color de marca aplicado ahora; las gráficas lo leen para volver a pintarse cuando cambia. */
export const activeBrand = signal<BrandColor>(DEFAULT_BRAND);

/** Aplica el color en la página (atributo data-brand en <html>); índigo es el de siempre y no lleva atributo. */
export function applyBrandColor(color: string | null | undefined, root: HTMLElement = document.documentElement): void {
  const palette = BRAND_PALETTES.find((p) => p.id === color);
  if (palette && palette.id !== DEFAULT_BRAND) {
    root.dataset['brand'] = palette.id;
  } else {
    delete root.dataset['brand'];
  }
  activeBrand.set(palette?.id ?? DEFAULT_BRAND);
}
