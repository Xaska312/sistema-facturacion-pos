import { AuditComponent, actorText } from './audit.component';

describe('AuditComponent (apoyo)', () => {
  it('por defecto muestra los últimos 7 días, hoy incluido', () => {
    const filters = AuditComponent.defaultFilters(new Date(2026, 9, 6));
    expect(filters.from).toBe('2026-09-30');
    expect(filters.to).toBe('2026-10-06');
    expect(filters.actorId).toBeNull();
  });

  it('nombra al autor: miembro, usuario retirado o el sistema', () => {
    expect(actorText('Ana Pérez', 'u1')).toBe('Ana Pérez');
    expect(actorText(null, 'u1')).toBe('Usuario retirado');
    expect(actorText(null, null)).toBe('Sistema');
  });
});
