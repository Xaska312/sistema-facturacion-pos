import { decodeAccessToken } from './jwt';
import { fakeToken } from './jwt.testing';

describe('decodeAccessToken', () => {
  it('lee los claims de un token de negocio', () => {
    const claims = decodeAccessToken(
      fakeToken({ sub: 'u1', exp: 1, typ: 'tenant', tid: 't1', perms: ['sales:create'] }),
    );
    expect(claims?.tid).toBe('t1');
    expect(claims?.perms).toEqual(['sales:create']);
  });

  it('devuelve null con tokens mal formados', () => {
    expect(decodeAccessToken('no-es-jwt')).toBeNull();
    expect(decodeAccessToken('a.b.c')).toBeNull();
    expect(decodeAccessToken(fakeToken({ exp: 1 }))).toBeNull();
  });
});
