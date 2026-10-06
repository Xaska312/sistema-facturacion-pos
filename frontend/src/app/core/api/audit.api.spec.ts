import { auditParams } from './audit.api';

describe('auditParams', () => {
  it('envía solo los filtros con valor', () => {
    const params = auditParams({ from: '2026-10-01', to: '2026-10-07', actorId: null, entity: 'product', action: '',
      q: '  café ' });
    expect(params.keys().sort()).toEqual(['entity', 'from', 'q', 'to']);
    expect(params.get('q')).toBe('café');
    expect(params.get('entity')).toBe('product');
  });

  it('sin filtros no envía nada (el servidor usa los últimos 7 días)', () => {
    const params = auditParams({ from: null, to: null, actorId: null, entity: null, action: null, q: null });
    expect(params.keys()).toEqual([]);
  });
});
