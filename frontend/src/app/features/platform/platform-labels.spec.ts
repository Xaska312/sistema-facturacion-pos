import { eventRange } from '../../core/api/platform.api';
import { eventDetail, eventLabel, isWarningEvent, suspendedMessage, tenantStatusKey } from './platform-labels';

describe('platform-labels', () => {
  it('nombra los eventos y resalta los de cuidado', () => {
    expect(eventLabel('LOGIN_FAILED')).toBe('Inicio de sesión fallido');
    expect(eventLabel('NUEVO')).toBe('NUEVO');
    expect(isWarningEvent('REFRESH_TOKEN_REUSED')).toBeTrue();
    expect(isWarningEvent('LOGIN_SUCCEEDED')).toBeFalse();
  });

  it('explica el detalle de cada evento', () => {
    expect(eventDetail({ event: 'LOGIN_FAILED', details: { reason: 'BAD_PASSWORD' } })).toBe('contraseña incorrecta');
    expect(eventDetail({ event: 'RATE_LIMITED', details: { path: '/api/v1/auth/login' } })).toBe('/api/v1/auth/login');
    expect(eventDetail({ event: 'TENANT_SUSPENDED', details: { reason: 'Pago pendiente' } })).toBe('Pago pendiente');
    expect(eventDetail({ event: 'LOGOUT', details: null })).toBeNull();
  });

  it('marca el estado del negocio', () => {
    expect(tenantStatusKey('ACTIVE')).toBe('active');
    expect(tenantStatusKey('SUSPENDED')).toBe('voided');
    expect(tenantStatusKey('PROVISIONING')).toBe('pending');
  });

  it('explica a los miembros por qué no pueden entrar', () => {
    expect(suspendedMessage('Pago pendiente', false)).toContain('Motivo: Pago pendiente.');
    expect(suspendedMessage(null, false)).toContain('comunícate con soporte');
    expect(suspendedMessage('Me retiro', true)).toContain('Su dueño lo eliminó');
  });

  it('convierte las fechas locales en un rango de instantes (hasta = inicio del día siguiente)', () => {
    const range = eventRange('2026-10-01', '2026-10-06');
    expect(range.from).toBe(new Date(2026, 9, 1).toISOString());
    expect(range.to).toBe(new Date(2026, 9, 7).toISOString());
    expect(eventRange(null, 'mal').to).toBeNull();
  });
});
