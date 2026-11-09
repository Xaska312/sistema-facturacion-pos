import { clearReferral, normalizeReferral, readReferral, referralMessage, rememberReferral } from './referral-code';

describe('Código de invitación (decisión 312)', () => {
  afterEach(() => clearReferral());

  it('recuerda solo códigos con forma de código', () => {
    rememberReferral(' esquin-7kq ');
    expect(readReferral()).toBe('ESQUIN-7KQ');
    rememberReferral('<script>');
    expect(readReferral()).toBe('ESQUIN-7KQ');
    expect(normalizeReferral(' ab c-12 3 ')).toBe('ABC-123');
  });

  it('arma el mensaje para WhatsApp con el enlace', () => {
    expect(referralMessage('La Esquina', 'https://app.xaska.co/registro?ref=X')).toContain('https://app.xaska.co/registro?ref=X');
  });
});
