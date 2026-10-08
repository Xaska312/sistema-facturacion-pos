import { isTenantPage, returnQuery, safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('acepta rutas internas', () => {
    expect(safeReturnUrl('/invitacion/abc')).toBe('/invitacion/abc');
  });

  it('rechaza URLs externas o raras', () => {
    expect(safeReturnUrl('https://malo.com')).toBeNull();
    expect(safeReturnUrl('//malo.com')).toBeNull();
    expect(safeReturnUrl('/\\malo.com')).toBeNull();
    expect(safeReturnUrl(null)).toBeNull();
  });
});

describe('returnQuery', () => {
  it('recuerda las páginas con sesión', () => {
    expect(returnQuery('/app/inventario?branchId=1')).toEqual({ returnUrl: '/app/inventario?branchId=1' });
    expect(returnQuery('/plataforma/negocios')).toEqual({ returnUrl: '/plataforma/negocios' });
    expect(returnQuery('/pos')).toEqual({ returnUrl: '/pos' });
  });

  it('no recuerda las públicas ni las externas', () => {
    expect(returnQuery('/login')).toEqual({});
    expect(returnQuery('/apple')).toEqual({});
    expect(returnQuery('//malo.com/app')).toEqual({});
    expect(returnQuery(undefined)).toEqual({});
  });
});

describe('isTenantPage', () => {
  it('reconoce las páginas de un negocio', () => {
    expect(isTenantPage('/app/ventas')).toBeTrue();
    expect(isTenantPage('/pos')).toBeTrue();
    expect(isTenantPage('/positivo')).toBeFalse();
    expect(isTenantPage('/negocios')).toBeFalse();
    expect(isTenantPage(null)).toBeFalse();
  });
});
