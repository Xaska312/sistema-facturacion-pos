import { QualityPoint, QualityPointInput, QualityReading, QualityShift } from '../../core/api/pharmacy.api';

/**
 * Temperatura y humedad (Fase 13-6, decisión 287): textos, rangos y la planilla del mes. Los rangos de fábrica son los
 * que suelen pedir en la visita: local de 15 a 30 °C y humedad de 35 a 70 %; nevera de 2 a 8 °C (cadena de frío).
 */
export const DEFAULT_POINTS: readonly QualityPointInput[] = [
  { name: 'Local', kind: 'ROOM', tempMin: 15, tempMax: 30, humidityMin: 35, humidityMax: 70 },
  { name: 'Nevera', kind: 'FRIDGE', tempMin: 2, tempMax: 8, humidityMin: null, humidityMax: null },
];

export function shiftLabel(shift: QualityShift): string {
  return shift === 'MORNING' ? 'Mañana' : 'Tarde';
}

const ONE = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** "24,3 °C" / "61 %". */
export function degrees(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${ONE.format(value)} °C`;
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${ONE.format(value)} %`;
}

/** "15 a 30 °C · humedad 35 a 70 %". */
export function rangeLabel(p: Pick<QualityPoint, 'tempMin' | 'tempMax' | 'humidityMin' | 'humidityMax'>): string {
  const temp = `${ONE.format(p.tempMin)} a ${ONE.format(p.tempMax)} °C`;
  return p.humidityMin === null || p.humidityMax === null ? temp
    : `${temp} · humedad ${ONE.format(p.humidityMin)} a ${ONE.format(p.humidityMax)} %`;
}

/** Lo mismo que decide el servidor: fuera del rango de temperatura o de humedad (si el punto la mide). */
export function outOfRange(p: QualityPoint, temperature: number | null, humidity: number | null): boolean {
  if (temperature === null || Number.isNaN(temperature)) {
    return false;
  }
  const round = (v: number) => Math.round(v * 10) / 10;
  const t = round(temperature);
  if (t < p.tempMin || t > p.tempMax) {
    return true;
  }
  if (p.humidityMin === null || p.humidityMax === null || humidity === null || Number.isNaN(humidity)) {
    return false;
  }
  const h = round(humidity);
  return h < p.humidityMin || h > p.humidityMax;
}

/** "24,3 °C · 61 %" (o solo la temperatura en la nevera). */
export function readingText(r: Pick<QualityReading, 'temperature' | 'humidity'>): string {
  return r.humidity === null ? degrees(r.temperature) : `${degrees(r.temperature)} · ${percent(r.humidity)}`;
}

export interface SheetRow {
  date: string;
  /** Por punto: [mañana, tarde]. */
  cells: Record<string, [QualityReading | null, QualityReading | null]>;
}

/** Planilla: un renglón por día del periodo (de {@code from} a {@code to}), con la lectura de cada punto y turno. */
export function sheet(readings: readonly QualityReading[], pointIds: readonly string[], from: string, to: string): SheetRow[] {
  const rows: SheetRow[] = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const end = new Date(ty, tm - 1, td);
  for (let d = new Date(fy, fm - 1, fd); d <= end; d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const cells: SheetRow['cells'] = {};
    for (const id of pointIds) {
      cells[id] = [null, null];
    }
    rows.push({ date, cells });
  }
  const byDate = new Map(rows.map((r) => [r.date, r]));
  for (const r of readings) {
    const row = byDate.get(r.date);
    if (row && row.cells[r.pointId]) {
      row.cells[r.pointId][r.shift === 'MORNING' ? 0 : 1] = r;
    }
  }
  return rows;
}

/** "2026-11" → del 1 al último día del mes. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
