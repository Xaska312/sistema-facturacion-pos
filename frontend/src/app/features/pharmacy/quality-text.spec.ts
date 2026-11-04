import { QualityPoint, QualityReading } from '../../core/api/pharmacy.api';
import { DEFAULT_POINTS, monthRange, outOfRange, rangeLabel, readingText, sheet, shiftLabel } from './quality-text';

const room: QualityPoint = { id: 'r', branchId: 'b', name: 'Local', kind: 'ROOM', tempMin: 15, tempMax: 30, humidityMin: 35,
  humidityMax: 70, active: true };
const fridge: QualityPoint = { ...room, id: 'f', name: 'Nevera', kind: 'FRIDGE', tempMin: 2, tempMax: 8, humidityMin: null,
  humidityMax: null };

const reading = (pointId: string, date: string, shift: 'MORNING' | 'AFTERNOON', temperature: number,
                 humidity: number | null = null): QualityReading => ({ id: `${pointId}${date}${shift}`, pointId,
  pointName: '', date, shift, temperature, humidity, outOfRange: false, actionTaken: null, recordedByName: null,
  recordedAt: '' });

describe('temperatura y humedad (decisión 287)', () => {
  it('rangos de fábrica y textos', () => {
    expect(DEFAULT_POINTS.map((p) => p.name)).toEqual(['Local', 'Nevera']);
    expect(rangeLabel(room)).toBe('15 a 30 °C · humedad 35 a 70 %');
    expect(rangeLabel(fridge)).toBe('2 a 8 °C');
    expect(readingText({ temperature: 24.3, humidity: 61 })).toBe('24,3 °C · 61 %');
    expect(readingText({ temperature: 4, humidity: null })).toBe('4 °C');
    expect(shiftLabel('AFTERNOON')).toBe('Tarde');
  });

  it('fuera de rango como el servidor (con un decimal)', () => {
    expect(outOfRange(room, 30, 70)).toBeFalse();
    expect(outOfRange(room, 30.04, 50)).toBeFalse();
    expect(outOfRange(room, 30.1, 50)).toBeTrue();
    expect(outOfRange(room, 20, 71)).toBeTrue();
    expect(outOfRange(fridge, 8.5, 90)).toBeTrue();
    expect(outOfRange(fridge, 5, 99)).toBeFalse();
    expect(outOfRange(room, null, null)).toBeFalse();
  });

  it('planilla: un renglón por día con mañana y tarde de cada punto', () => {
    const rows = sheet([reading('r', '2026-11-02', 'AFTERNOON', 25, 60), reading('f', '2026-11-01', 'MORNING', 4)],
      ['r', 'f'], '2026-11-01', '2026-11-03');
    expect(rows.map((r) => r.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(rows[0].cells['f'][0]?.temperature).toBe(4);
    expect(rows[1].cells['r'][1]?.humidity).toBe(60);
    expect(rows[2].cells['r']).toEqual([null, null]);
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});
