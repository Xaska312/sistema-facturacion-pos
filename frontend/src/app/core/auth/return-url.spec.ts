import { safeReturnUrl } from './return-url';

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
