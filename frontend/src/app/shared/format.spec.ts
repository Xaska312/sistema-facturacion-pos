import { formatDate, formatDateTime, formatRelative, formatTime } from './format';

describe('format', () => {
  const now = new Date('2026-10-05T15:00:00');

  it('formatea fechas en español y muestra guion sin valor', () => {
    expect(formatDate('2026-10-05T10:00:00')).toContain('2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('no es fecha')).toBe('—');
    expect(formatDateTime('2026-10-05T10:00:00')).toContain('2026');
    expect(formatTime('2026-10-05T15:20:00')).toContain('3:20');
    expect(formatTime(undefined)).toBe('—');
  });

  it('no deja espacios especiales de Intl', () => {
    expect(/[\u00a0\u202f]/.test(formatDateTime('2026-10-05T15:20:00'))).toBeFalse();
  });

  it('muestra tiempos relativos cortos', () => {
    expect(formatRelative('2026-10-05T14:59:50', now)).toBe('justo ahora');
    expect(formatRelative('2026-10-05T14:55:00', now)).toBe('hace 5 minutos');
    expect(formatRelative('2026-10-05T12:00:00', now)).toBe('hace 3 horas');
    expect(formatRelative('2026-10-04T15:00:00', now)).toBe('ayer');
  });

  it('pasada una semana muestra la fecha', () => {
    expect(formatRelative('2026-09-01T10:00:00', now)).toBe(formatDate('2026-09-01T10:00:00'));
  });
});
