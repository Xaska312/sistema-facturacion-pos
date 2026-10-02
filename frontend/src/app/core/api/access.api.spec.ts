import { groupByModule, invitationLink } from './access.api';

describe('invitationLink', () => {
  it('arma el enlace público con el token codificado', () => {
    expect(invitationLink('https://pos.co/', 'abc-_123')).toBe('https://pos.co/invitacion/abc-_123');
  });
});

describe('groupByModule', () => {
  it('agrupa conservando el orden', () => {
    const groups = groupByModule([
      { code: 'a:read', module: 'm1', description: '' },
      { code: 'b:read', module: 'm2', description: '' },
      { code: 'a:manage', module: 'm1', description: '' },
    ]);
    expect(groups.map((g) => g.module)).toEqual(['m1', 'm2']);
    expect(groups[0].permissions.map((p) => p.code)).toEqual(['a:read', 'a:manage']);
  });
});
