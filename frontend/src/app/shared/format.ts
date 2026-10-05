/** Fechas en español de Colombia. Las fechas de la API llegan en ISO-8601. */

const DATE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const TIME = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "5 oct 2026". */
export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  return date ? clean(DATE.format(date)) : '—';
}

/** "5 oct 2026, 3:20 p. m.". */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  return date ? clean(DATE_TIME.format(date)) : '—';
}

/** "3:20 p. m.". */
export function formatTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  return date ? clean(TIME.format(date)) : '—';
}

/**
 * Tiempo relativo corto: "hace 5 minutos", "ayer", "hace 3 días". Pasada una semana muestra la fecha.
 * {@code now} se recibe para poder probarla.
 */
export function formatRelative(value: string | number | Date | null | undefined, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) {
    return '—';
  }
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) {
    return 'justo ahora';
  }
  if (abs < 3600) {
    return RELATIVE.format(Math.round(seconds / 60), 'minute');
  }
  if (abs < 86400) {
    return RELATIVE.format(Math.round(seconds / 3600), 'hour');
  }
  if (abs < 7 * 86400) {
    return RELATIVE.format(Math.round(seconds / 86400), 'day');
  }
  return formatDate(date);
}

/** Intl usa espacios especiales (U+00A0, U+202F) que se ven raros al copiar: se cambian por espacios normales. */
function clean(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ');
}
