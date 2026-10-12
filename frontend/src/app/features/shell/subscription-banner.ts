import { Subscription } from '../../core/api/api.models';
import { formatDate } from '../../shared/format';

export function subscriptionBanner(s: Subscription | null): { tone: 'warning' | 'danger'; text: string } | null {
  if (!s) {
    return null;
  }

  if (s.status === 'TRIAL' && s.daysLeft <= 7) {
    let text = `Tu prueba gratis termina en ${s.daysLeft} días.`;
    if (s.daysLeft === 0) {
      text = 'Tu prueba gratis termina hoy.';
    } else if (s.daysLeft === 1) {
      text = 'Tu prueba gratis termina mañana.';
    }
    return { tone: 'warning', text };
  }

  if (s.status === 'PAST_DUE') {
    return { tone: 'danger', text: `Tu plan venció. Todo sigue funcionando hasta el ${formatDate(s.graceEndsAt)}.` };
  }

  if (s.status === 'EXPIRED') {
    return { tone: 'danger', text: 'La suscripción venció: puedes consultar, pero no registrar ventas ni cambios.' };
  }

  return null;
}
