import { NUDGE_MAX_DISMISSALS, dismissNudge, nudgeDismissals, nudgeHidden } from './aska-nudge';

describe('Aska en el momento del dolor (decisión 308)', () => {
  beforeEach(() => {
    localStorage.removeItem('xaska.aska-nudge.purchase');
    localStorage.removeItem('xaska.aska-nudge.stock');
  });

  it('deja de salir al cerrarlo 3 veces con "Ahora no"', () => {
    for (let i = 0; i < NUDGE_MAX_DISMISSALS - 1; i++) {
      dismissNudge('purchase', false);
    }
    expect(nudgeHidden('purchase')).toBeFalse();
    dismissNudge('purchase', false);
    expect(nudgeHidden('purchase')).toBeTrue();
    dismissNudge('purchase', false);
    expect(nudgeDismissals('purchase')).toBe(NUDGE_MAX_DISMISSALS);
  });

  it('"No volver a mostrar" lo apaga de una vez y solo para ese momento', () => {
    dismissNudge('stock', true);
    expect(nudgeHidden('stock')).toBeTrue();
    expect(nudgeHidden('purchase')).toBeFalse();
  });
});
