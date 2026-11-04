import { MapSpot, TableShape } from '../../core/api/dining.api';
import { PLAN_H, PLAN_W, boxStyle, moveBy, normalizeSpot, placeTables, resize, stateLabel } from './table-map';

const spot = (x: number | null, y: number | null, w = 12, h = 12, shape: MapSpot['shape'] = 'SQUARE'): MapSpot =>
  ({ x, y, w, h, shape });

describe('mapa de mesas (decisión 284)', () => {
  it('mantiene las mesas dentro del plano; redonda y cuadrada son igual de anchas que altas', () => {
    expect(normalizeSpot(spot(95, 69, 20, 10, 'RECT'))).toEqual({ x: 80, y: 60, w: 20, h: 10, shape: 'RECT' });
    expect(normalizeSpot(spot(10, 10, 14, 30, 'ROUND'))).toEqual({ x: 10, y: 10, w: 14, h: 14, shape: 'ROUND' });
    expect(normalizeSpot(spot(null, null, 2, 2)).w).toBe(4);
  });

  it('acomoda las mesas sin lugar en los huecos, sin pisar las ubicadas', () => {
    const placed = placeTables(['a', 'b', 'c'], (k) => (k === 'a' ? spot(3, 3) : spot(null, null)));
    expect(placed[0]).toEqual(jasmine.objectContaining({ item: 'a', x: 3, y: 3 }));
    const [a, b, c] = placed;
    for (const t of [b, c]) {
      expect(t.x + t.w <= a.x || a.x + a.w <= t.x || t.y + t.h <= a.y || a.y + a.h <= t.y).toBeTrue();
      expect(t.x + t.w).toBeLessThanOrEqual(PLAN_W);
      expect(t.y + t.h).toBeLessThanOrEqual(PLAN_H);
    }
    expect(b.x).not.toBe(c.x);
  });

  it('posición en porcentajes, movimiento con imán de 0,5 y tamaño dentro de los límites', () => {
    expect(boxStyle({ x: 50, y: 35, w: 10, h: 7 })).toEqual({ left: '50%', top: '50%', width: '10%', height: '10%' });
    expect(moveBy({ x: 90, y: 60, w: 12, h: 12 }, 20, 0.3)).toEqual({ x: 88, y: 58 });
    expect(moveBy({ x: 10, y: 10, w: 12, h: 12 }, 1.26, -0.74)).toEqual({ x: 11.5, y: 9.5 });
    const t = resize({ x: 80, y: 50, w: 12, h: 12, shape: 'SQUARE' as TableShape }, 30, 8, 'RECT');
    expect(t).toEqual({ x: 70, y: 50, w: 30, h: 8, shape: 'RECT' });
    expect(stateLabel('BILL')).toBe('Pidió la cuenta');
  });
});
