import { AiTrial } from '../../core/api/ai.api';
import { challengesDone, daysLeftText, markWelcomeSeen, welcomeSeen } from './aska-trial';

describe('Prueba gratis de XASKA IA (decisión 311)', () => {
  it('cuenta los días y los retos', () => {
    expect(daysLeftText(14)).toBe('Te quedan 14 días');
    expect(daysLeftText(1)).toBe('Te queda 1 día');
    expect(daysLeftText(0)).toBe('Último día');
    const t: AiTrial = { endsAt: '', daysLeft: 3, scanned: true, asked: false, loaded: true };
    expect(challengesDone(t)).toBe(2);
  });

  it('la bienvenida sale una sola vez por negocio', () => {
    localStorage.removeItem('xaska.aska-welcome.t1');
    expect(welcomeSeen('t1')).toBeFalse();
    markWelcomeSeen('t1');
    expect(welcomeSeen('t1')).toBeTrue();
    expect(welcomeSeen('t2')).toBeFalse();
    localStorage.removeItem('xaska.aska-welcome.t1');
  });
});
