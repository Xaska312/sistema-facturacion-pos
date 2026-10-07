/** Rangos rápidos de fechas para los reportes (fechas AAAA-MM-DD del calendario del negocio). */

/** Zona horaria de los negocios (Colombia); el servidor usa la de los ajustes del negocio. */
export const BUSINESS_TIME_ZONE = 'America/Bogota';

/**
 * Hoy en la zona del negocio, como fecha local a medianoche. Con el reloj del equipo en otra zona (o en UTC), "Hoy"
 * pedía otro día después de las 7 p. m. y el tablero quedaba en cero (QA DIN-6).
 */
export function businessToday(now: Date = new Date(), timeZone: string = BUSINESS_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(part('year'), part('month') - 1, part('day'));
}
export type QuickRange = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth';

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function quickRange(range: QuickRange, today: Date = businessToday()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (range) {
    case 'today':
      return { from: isoDate(today), to: isoDate(today) };
    case 'yesterday': {
      const day = isoDate(new Date(y, m, d - 1));
      return { from: day, to: day };
    }
    case 'last7':
      return { from: isoDate(new Date(y, m, d - 6)), to: isoDate(today) };
    case 'last30':
      return { from: isoDate(new Date(y, m, d - 29)), to: isoDate(today) };
    case 'thisMonth':
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(today) };
    case 'lastMonth':
      return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
  }
}

/** Fechas AAAA-MM-DD de {@code from} a {@code to} (incluidas); vacío si el rango no es válido o supera 367 días. */
export function daysBetween(from: string, to: string): string[] {
  const start = parseIso(from);
  const end = parseIso(to);
  if (!start || !end || end < start) {
    return [];
  }
  const days: string[] = [];
  for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (days.length >= MAX_RANGE_DAYS) {
      return []; // más de un año: el servidor lo rechaza; la URL cae en el periodo predeterminado (QA UI-9)
    }
    days.push(isoDate(d));
  }
  return days;
}

/** Periodo elegido en el tablero o en los reportes (se guarda en la URL para poder compartir el enlace). */
export type PeriodKey = QuickRange | 'custom';

export interface PeriodSelection {
  period: PeriodKey;
  /** Solo para 'custom'. */
  from: string | null;
  to: string | null;
  branchId: string | null;
}

export interface DateRange {
  from: string;
  to: string;
}

/** Máximo que acepta el backend por consulta (decisión 90). */
export const MAX_RANGE_DAYS = 367;

export const PERIOD_OPTIONS: readonly { key: PeriodKey; label: string; param: string }[] = [
  { key: 'today', label: 'Hoy', param: 'hoy' },
  { key: 'yesterday', label: 'Ayer', param: 'ayer' },
  { key: 'last7', label: '7 días', param: '7d' },
  { key: 'last30', label: '30 días', param: '30d' },
  { key: 'thisMonth', label: 'Mes actual', param: 'mes' },
  { key: 'lastMonth', label: 'Mes anterior', param: 'mes-anterior' },
  { key: 'custom', label: 'Rango', param: 'rango' },
];

/** Lee la selección de los parámetros de la URL (?periodo=7d&sucursal=…); lo desconocido toma {@code fallback}. */
export function periodFromParams(get: (name: string) => string | null, fallback: PeriodKey = 'today'): PeriodSelection {
  const option = PERIOD_OPTIONS.find((o) => o.param === get('periodo'));
  const from = get('desde');
  const to = get('hasta');
  const period = option?.key ?? fallback;
  const validCustom = period === 'custom' && !!from && !!to && daysBetween(from, to).length > 0;
  return {
    period: period === 'custom' && !validCustom ? fallback : period,
    from: validCustom ? from : null,
    to: validCustom ? to : null,
    branchId: get('sucursal') || null,
  };
}

/** Parámetros de URL de la selección (null quita el parámetro). */
export function periodToParams(selection: PeriodSelection): Record<string, string | null> {
  const option = PERIOD_OPTIONS.find((o) => o.key === selection.period);
  const custom = selection.period === 'custom';
  return {
    periodo: option?.param ?? null,
    desde: custom ? selection.from : null,
    hasta: custom ? selection.to : null,
    sucursal: selection.branchId,
  };
}

/** Fechas del periodo; un rango personalizado inválido cae en "hoy". */
export function resolvePeriod(selection: PeriodSelection, today: Date = businessToday()): DateRange {
  if (selection.period === 'custom') {
    if (selection.from && selection.to && daysBetween(selection.from, selection.to).length > 0) {
      return { from: selection.from, to: selection.to };
    }
    return quickRange('today', today);
  }
  return quickRange(selection.period, today);
}

/** Suma {@code days} días (negativo = resta) a una fecha AAAA-MM-DD. */
export function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  return date ? isoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)) : iso;
}

/** Periodo anterior del mismo largo, justo antes de {@code range} (para comparar). */
export function previousRange(range: DateRange): DateRange {
  const start = parseIso(range.from);
  const days = Math.max(1, daysBetween(range.from, range.to).length);
  if (!start) {
    return range;
  }
  const to = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
  return { from: isoDate(from), to: isoDate(to) };
}

/** Texto corto del periodo: "Hoy", "Últimos 7 días", "1–5 oct 2026"… */
export function periodLabel(selection: PeriodSelection, range: DateRange): string {
  switch (selection.period) {
    case 'today':
      return 'Hoy';
    case 'yesterday':
      return 'Ayer';
    case 'last7':
      return 'Últimos 7 días';
    case 'last30':
      return 'Últimos 30 días';
    case 'thisMonth':
      return 'Mes actual';
    case 'lastMonth':
      return 'Mes anterior';
    default:
      return range.from === range.to ? shortDate(range.from) : `${shortDate(range.from)} – ${shortDate(range.to)}`;
  }
}

/** "lun 5 oct" para ejes y textos cortos. */
export function shortDate(iso: string): string {
  const date = parseIso(iso);
  if (!date) {
    return iso;
  }
  return SHORT_DATE.format(date)
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[.,]/g, '')
    .replace(/ de /g, ' ');
}

const SHORT_DATE = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}
