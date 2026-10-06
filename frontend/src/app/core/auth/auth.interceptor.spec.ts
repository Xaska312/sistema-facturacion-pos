import { HttpErrorResponse } from '@angular/common/http';
import { isTenantUnavailable } from './auth.interceptor';

describe('isTenantUnavailable', () => {
  it('reconoce el 403 de negocio suspendido por su código', () => {
    const suspended = new HttpErrorResponse({ status: 403, error: { code: 'TENANT_UNAVAILABLE', detail: 'x' } });
    const forbidden = new HttpErrorResponse({ status: 403, error: { detail: 'Sin permiso' } });
    const other = new HttpErrorResponse({ status: 422, error: { code: 'TENANT_UNAVAILABLE' } });
    expect(isTenantUnavailable(suspended)).toBeTrue();
    expect(isTenantUnavailable(forbidden)).toBeFalse();
    expect(isTenantUnavailable(other)).toBeFalse();
    expect(isTenantUnavailable(new Error('x'))).toBeFalse();
  });
});
