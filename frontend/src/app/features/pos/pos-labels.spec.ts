import { methodIcon, methodLabel, openedSince, stockLabel } from './pos-labels';

describe('pos-labels', () => {
  it('da icono y nombre corto a los medios de pago conocidos', () => {
    expect(methodIcon('CASH')).toBe('pi pi-money-bill');
    expect(methodLabel('TRANSFER', 'Transferencia (Nequi, Daviplata, bancos)')).toBe('Transferencia');
    expect(methodIcon('OTRO')).toBe('pi pi-wallet');
    expect(methodLabel('OTRO', 'Bono regalo')).toBe('Bono regalo');
  });

  it('muestra desde cuándo está abierta la caja', () => {
    const now = new Date(2026, 9, 5, 15, 0);
    expect(openedSince(new Date(2026, 9, 5, 8, 5).toISOString(), now)).toMatch(/^desde 8:05/);
    expect(openedSince(new Date(2026, 9, 4, 20, 5).toISOString(), now)).toContain('2026');
    expect(openedSince('no es fecha', now)).toBe('');
  });

  it('resume la existencia para la tarjeta', () => {
    expect(stockLabel(undefined)).toBeNull();
    expect(stockLabel(0)).toBe('Agotado');
    expect(stockLabel(-2)).toBe('Agotado');
    expect(stockLabel(1500)).toBe('1.500 disp.');
  });
});
