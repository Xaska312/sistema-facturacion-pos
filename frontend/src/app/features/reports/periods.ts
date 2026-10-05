/** Rangos rápidos de fechas para los reportes (fechas AAAA-MM-DD del calendario local). */
export type QuickRange = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function quickRange(range: QuickRange, today: Date = new Date()): { from: string; to: string } {
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
  for (let d = start; d <= end && days.length < 367; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(isoDate(d));
  }
  return days;
}

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}
