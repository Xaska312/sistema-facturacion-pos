import { MAX_WAIT_MS, newClientId, reconnectDelay, retryAfterMs } from './reconnect';

describe('reconnectDelay (decisión 291)', () => {
  it('tras un cierre normal espera entre 0,5 y 3 s, repartido al azar', () => {
    expect(reconnectDelay(0, 0, 0)).toBe(500);
    expect(reconnectDelay(0, 0, 1)).toBe(3000);
    expect(reconnectDelay(0, 0, 0.5)).toBe(1750);
  });

  it('con fallos crece y varía entre la mitad y una vez y media', () => {
    expect(reconnectDelay(1, 0, 0)).toBe(500);
    expect(reconnectDelay(1, 0, 1)).toBe(1500);
    expect(reconnectDelay(3, 0, 0.5)).toBe(4000);
    expect(reconnectDelay(50, 0, 0.5)).toBe(MAX_WAIT_MS);
    expect(reconnectDelay(50, 0, 1)).toBeLessThanOrEqual(MAX_WAIT_MS * 1.5);
  });

  it('con 429 nunca vuelve antes de lo que pidió el servidor', () => {
    expect(reconnectDelay(1, 40_000, 0)).toBe(40_000);
    expect(reconnectDelay(1, 40_000, 1)).toBe(45_000);
  });
});

describe('retryAfterMs', () => {
  it('convierte los segundos y usa 60 s si no hay un número', () => {
    expect(retryAfterMs('12')).toBe(12_000);
    expect(retryAfterMs(null)).toBe(60_000);
    expect(retryAfterMs('mañana')).toBe(60_000);
    expect(retryAfterMs('9999')).toBe(300_000);
  });
});

describe('newClientId', () => {
  it('cumple el formato que acepta el servidor y cambia cada vez', () => {
    const a = newClientId();
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(newClientId()).not.toBe(a);
  });
});
