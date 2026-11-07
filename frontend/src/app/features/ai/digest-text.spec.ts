import { DigestPoint } from '../../core/api/ai.api';
import { digestTitle, sortPoints } from './digest-text';

describe('Resumen del día (decisión 299)', () => {
  it('nombra el día del resumen', () => {
    expect(digestTitle('2026-11-07', '2026-11-07')).toBe('Resumen de hoy');
    expect(digestTitle('2026-11-06', '2026-11-07')).toBe('Resumen de ayer');
    expect(digestTitle('2026-11-01', '2026-11-07')).toContain('Resumen del 1');
  });

  it('pone primero lo urgente', () => {
    const p = (tone: DigestPoint['tone']): DigestPoint => ({ section: 'SALES', tone, title: tone, detail: '' });
    expect(sortPoints([p('good'), p('info'), p('bad'), p('warning')]).map((x) => x.tone))
      .toEqual(['bad', 'warning', 'info', 'good']);
  });
});
