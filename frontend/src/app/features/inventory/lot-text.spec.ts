import { daysText, expiryBadge, expiryText } from './lot-text';

describe('vencimientos (Fase 13-3)', () => {
  it('pone la insignia según el estado del lote', () => {
    expect(expiryBadge({ status: 'EXPIRED', daysLeft: -2 })).toEqual({ key: 'expired', label: 'Vencido' });
    expect(expiryBadge({ status: 'EXPIRING', daysLeft: 12 })).toEqual({ key: 'pending', label: 'Vence en 12 días' });
    expect(expiryBadge({ status: 'OK', daysLeft: 400 }).label).toBe('Vigente');
  });

  it('dice cuánto falta o cuánto hace que venció', () => {
    expect(daysText(0)).toBe('Vence hoy');
    expect(daysText(1)).toBe('Vence mañana');
    expect(daysText(-1)).toBe('Venció ayer');
    expect(daysText(-5)).toBe('Venció hace 5 días');
    expect(daysText(null)).toBe('Sin fecha');
    expect(expiryText({ expirationDate: '2027-01-31', daysLeft: 90 })).toBe('2027-01-31 · Vence en 90 días');
    expect(expiryText({ expirationDate: null, daysLeft: null })).toBe('Sin fecha');
  });
});
