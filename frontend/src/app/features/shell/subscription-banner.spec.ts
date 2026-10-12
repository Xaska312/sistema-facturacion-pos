import { Subscription } from '../../core/api/api.models';
import { subscriptionBanner } from './subscription-banner';
import { formatDate } from '../../shared/format';

describe('subscription-banner', () => {
  function sub(status: any, daysLeft: number, graceEndsAt: string | null = null): Subscription {
    return { status, daysLeft, graceEndsAt } as Subscription;
  }

  it('devuelve null si no hay suscripción, está activa, o le faltan más de 7 días de prueba', () => {
    expect(subscriptionBanner(null)).toBeNull();
    expect(subscriptionBanner(sub('ACTIVE', 10))).toBeNull();
    expect(subscriptionBanner(sub('TRIAL', 8))).toBeNull();
  });

  it('avisa de prueba gratis próxima a vencer', () => {
    expect(subscriptionBanner(sub('TRIAL', 5))?.text).toBe('Tu prueba gratis termina en 5 días.');
    expect(subscriptionBanner(sub('TRIAL', 1))?.text).toBe('Tu prueba gratis termina mañana.');
    expect(subscriptionBanner(sub('TRIAL', 0))?.text).toBe('Tu prueba gratis termina hoy.');
    expect(subscriptionBanner(sub('TRIAL', 5))?.tone).toBe('warning');
  });

  it('avisa de plan vencido en periodo de gracia', () => {
    const result = subscriptionBanner(sub('PAST_DUE', -1, '2026-10-15T12:00:00Z'));
    expect(result?.tone).toBe('danger');
    expect(result?.text).toBe(`Tu plan venció. Todo sigue funcionando hasta el ${formatDate('2026-10-15T12:00:00Z')}.`);
  });

  it('avisa de plan expirado', () => {
    const result = subscriptionBanner(sub('EXPIRED', -15));
    expect(result?.tone).toBe('danger');
    expect(result?.text).toBe('La suscripción venció: puedes consultar, pero no registrar ventas ni cambios.');
  });
});
