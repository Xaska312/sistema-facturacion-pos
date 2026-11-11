import { DigestPoint, DigestWeatherCode } from '../../core/api/ai.api';
import { XIconName } from '../../shared/icons/xicons';

/** Ícono de cada sección del Resumen del día (decisión 299). */
export const SECTION_ICON: Record<DigestPoint['section'], XIconName> = {
  SALES: 'reports',
  CASH: 'cash',
  INVENTORY: 'stock',
  MONEY: 'payables',
  FINANCE: 'expenses',
};

/** Etiqueta que se lee junto al color del tono (no depender solo del color). */
export const TONE_LABEL: Record<DigestPoint['tone'], string> = {
  good: 'Bien',
  warning: 'Ojo',
  bad: 'Urgente',
  info: 'Dato',
};

/** "Resumen de hoy", "Resumen de ayer" o "Resumen del 5 nov." según la fecha del negocio. */
export function digestTitle(date: string, today: string): string {
  if (date === today) {
    return 'Resumen de hoy';
  }
  const d = new Date(`${date}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  if (Math.round((t.getTime() - d.getTime()) / 86_400_000) === 1) {
    return 'Resumen de ayer';
  }
  return `Resumen del ${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`;
}

/** Lo urgente primero, luego lo que pide atención, lo informativo y lo bueno. */
export function sortPoints(points: DigestPoint[]): DigestPoint[] {
  const order: Record<DigestPoint['tone'], number> = { bad: 0, warning: 1, info: 2, good: 3 };
  return [...points].sort((a, b) => order[a.tone] - order[b.tone]);
}

/** El clima del negocio (decisión 307): lo calcula XASKA con las ventas frente a la semana pasada y lo que encontró Aska. */
export const WEATHER: Record<DigestWeatherCode, { emoji: string; label: string }> = {
  SUNNY: { emoji: '☀️', label: 'Soleado' },
  PARTLY: { emoji: '🌤️', label: 'Despejado, con alguna nube' },
  CLOUDY: { emoji: '⛅', label: 'Nublado' },
  RAIN: { emoji: '🌧️', label: 'Lluvioso' },
  STORM: { emoji: '⛈️', label: 'Tormenta' },
  QUIET: { emoji: '🌙', label: 'Un día quieto' },
};

export function weatherOf(code: DigestWeatherCode | null | undefined): { emoji: string; label: string } | null {
  return code ? (WEATHER[code] ?? null) : null;
}
